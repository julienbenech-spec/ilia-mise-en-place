import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const BASE = "https://api.zelty.fr/2.10";
const PAGE = 100;

async function cfg(key: string): Promise<string | null> {
  const { data } = await sb.from("admin_config").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function setCfg(key: string, value: string) {
  await sb.from("admin_config").upsert({ key, value });
}

// storeRaw = false pour les commandes : jamais de données clients en base
async function zget(path: string, query: Record<string, string> = {}, storeRaw = true) {
  const key = Deno.env.get("ZELTY_API_KEY");
  if (!key) throw new Error("ZELTY_API_KEY manquant");
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
    if (r.status === 429 || r.status >= 500) {
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
      continue;
    }
    const text = await r.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 2000) }; }
    if (storeRaw || r.status !== 200) {
      await sb.from("zelty_raw").insert({
        path: url.pathname + url.search, status: r.status,
        body: storeRaw ? body : { note: "corps non conserve" },
      });
    }
    return { status: r.status, body };
  }
  throw new Error("Zelty indisponible apres plusieurs essais: " + path);
}

type Agg = Map<string, { name: string; kind: string; qty: number; portion: number }>;

function keyOf(it: any): string {
  const isOpt = it.type === "option_value";
  const raw = it.item_id ?? it.id ?? it.name;
  return (isOpt ? "opt:" : "dish:") + (isOpt ? it.id : raw);
}

function children(it: any): any[] {
  return [...(it.modifiers ?? []), ...(it.items ?? it.contents ?? [])];
}

// Nombre de bases choisies dans un bowl (pour 1 bowl).
function countBases(it: any, bases: Set<string>, mult = 1): number {
  let n = 0;
  for (const c of children(it)) {
    const q = (Number(c.quantity) || 1) * mult;
    if (bases.has(keyOf(c))) n += q;
    n += countBases(c, bases, q);
  }
  return n;
}

// baseShare : part d'une portion pour chaque base du bowl (1, 1/2, 1/3…)
function addItem(agg: Agg, it: any, mult: number, bases: Set<string>, baseShare: number) {
  const q = (Number(it.quantity) || 1) * mult;
  const key = keyOf(it);
  const cur = agg.get(key) ?? {
    name: it.name ?? "?", kind: it.type === "option_value" ? "option" : "dish", qty: 0, portion: 0,
  };
  cur.qty += q;
  cur.portion += bases.has(key) ? q * baseShare : q;
  agg.set(key, cur);
  for (const c of children(it)) addItem(agg, c, q, bases, baseShare);
}

async function baseItems(): Promise<Set<string>> {
  const { data: preps } = await sb.from("preparations").select("id").eq("category", "bases");
  const ids = (preps ?? []).map((p: any) => p.id);
  if (!ids.length) return new Set();
  const { data: its } = await sb.from("items").select("item_id").in("preparation_id", ids);
  return new Set((its ?? []).map((i: any) => i.item_id));
}

async function importDay(restaurantId: number, zeltyId: string, day: string) {
  const bases = await baseItems();
  const aggs: Record<string, Agg> = { midi: new Map(), soir: new Map() };
  const stats: Record<string, { orders: number; revenue: number }> = {
    midi: { orders: 0, revenue: 0 }, soir: { orders: 0, revenue: 0 },
  };
  let offset = 0;
  while (true) {
    const { status, body } = await zget("/orders", {
      restaurant_id: zeltyId, from: day, to: day,
      limit: String(PAGE), offset: String(offset), "expand[]": "items",
    }, false);
    if (status !== 200) throw new Error(`orders ${day}: HTTP ${status}`);
    const orders: any[] = body.orders ?? [];
    for (const o of orders) {
      if (String(o.status).startsWith("cancel")) continue;
      const ts: string = o.created_at ?? o.closed_at ?? "";
      if (ts.slice(0, 10) !== day) continue;
      const hour = Number(ts.slice(11, 13));
      const svc = hour < 16 ? "midi" : "soir";
      stats[svc].orders++;
      stats[svc].revenue += Number(o.price?.final_amount_inc_tax) || 0;
      for (const it of o.items ?? []) {
        const n = countBases(it, bases);
        addItem(aggs[svc], it, 1, bases, n > 1 ? 1 / n : 1);
      }
    }
    if (orders.length < PAGE) break;
    offset += PAGE;
  }

  await sb.from("sales_daily").delete().eq("restaurant_id", restaurantId).eq("day", day);
  await sb.from("day_stats").delete().eq("restaurant_id", restaurantId).eq("day", day);

  const sales: any[] = [];
  const catalog = new Map<string, any>();
  for (const svc of ["midi", "soir"]) {
    for (const [k, v] of aggs[svc]) {
      sales.push({
        restaurant_id: restaurantId, day, item_id: k, item_name: v.name, qty: v.qty, service: svc,
        qty_portion: Math.round(v.portion * 1000) / 1000,
      });
      catalog.set(k, { item_id: k, name: v.name, kind: v.kind });
    }
    if (stats[svc].orders > 0) {
      await sb.from("day_stats").insert({
        restaurant_id: restaurantId, day, service: svc,
        orders: stats[svc].orders, revenue_cents: stats[svc].revenue,
      });
    }
  }
  if (catalog.size) {
    await sb.from("items").upsert([...catalog.values()], { onConflict: "item_id", ignoreDuplicates: true });
  }
  for (let i = 0; i < sales.length; i += 500) {
    const { error } = await sb.from("sales_daily").insert(sales.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }
  return stats.midi.orders + stats.soir.orders;
}

async function restaurant(zeltyId: string) {
  const { data } = await sb.from("restaurants").select("id").eq("zelty_id", zeltyId).single();
  return data!.id as number;
}

function prevDay(d: string) {
  const t = new Date(d + "T12:00:00Z");
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  try {
    const token = req.headers.get("x-admin-token");
    if (!token || token !== (await cfg("admin_token"))) {
      return new Response("forbidden", { status: 403 });
    }
    const p = await req.json().catch(() => ({}));

    if (p.action === "get") {
      const { status } = await zget(p.path, p.query ?? {}, !String(p.path).startsWith("/orders"));
      return Response.json({ status });
    }

    if (p.action === "import_day") {
      const rid = await restaurant(p.zelty_id);
      const n = await importDay(rid, p.zelty_id, p.day);
      return Response.json({ day: p.day, orders: n });
    }

    // Réimport d'une plage de jours (du plus récent au plus ancien), quelques jours par appel.
    if (p.action === "reimport_range") {
      const rid = await restaurant(p.zelty_id);
      let cursor = p.to as string;
      const log = [];
      for (let i = 0; i < Number(p.days ?? 5) && cursor >= p.from; i++) {
        log.push({ day: cursor, orders: await importDay(rid, p.zelty_id, cursor) });
        cursor = prevDay(cursor);
      }
      return Response.json({ next: cursor >= p.from ? cursor : null, log });
    }

    // Rattrapage de l'historique : remonte le temps jour par jour depuis le curseur.
    // S'arrete apres 30 jours consecutifs sans commande (= avant l'ouverture).
    if (p.action === "backfill_next") {
      if ((await cfg("backfill_done")) === "true") return Response.json({ done: true });
      const zid = (await cfg("backfill_zelty_id"))!;
      const rid = await restaurant(zid);
      let cursor = (await cfg("backfill_cursor"))!;
      let empty = Number((await cfg("backfill_empty_streak")) ?? "0");
      const days = Number(p.days ?? 6);
      const log = [];
      for (let i = 0; i < days; i++) {
        const n = await importDay(rid, zid, cursor);
        log.push({ day: cursor, orders: n });
        empty = n === 0 ? empty + 1 : 0;
        if (n > 0) await sb.from("restaurants").update({ opened_on: cursor }).eq("id", rid);
        cursor = prevDay(cursor);
        if (empty >= 30) { await setCfg("backfill_done", "true"); break; }
      }
      await setCfg("backfill_cursor", cursor);
      await setCfg("backfill_empty_streak", String(empty));
      return Response.json({ log });
    }

    return Response.json({ error: "action inconnue" }, { status: 400 });
  } catch (e) {
    await sb.from("zelty_raw").insert({ path: "error", status: 0, body: { error: String(e) } });
    return Response.json({ error: String(e) }, { status: 500 });
  }
});

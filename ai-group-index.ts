// Supabase Edge Function: ai-group
// Bir nechta zargarlik rasmini oladi, bir xil buyumlarni guruhlaydi.
// Joylash: supabase/functions/ai-group/index.ts

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TOOL = {
  name: "group_images",
  description: "Rasmlarni bir xil buyumlarga guruhlaydi.",
  input_schema: {
    type: "object",
    properties: {
      groups: {
        type: "array",
        description: "Har bir element — bir buyumning rasmlar indekslari ro'yxati",
        items: {
          type: "array",
          items: { type: "number" },
        },
      },
    },
    required: ["groups"],
  },
};

const SYSTEM = `Sen zargarlik rasmlari tahlilchisisisan.
Senga bir nechta zargarlik buyumi rasmlari beriladi (0, 1, 2... tartibda).
Vazifang: bir xil buyumning turli burchakdan olingan rasmlarini aniqlash va guruhlash.

QOIDALAR:
- Bir xil buyum: shakl, naqsh, tosh joylashuvi, o'lcham bir xil bo'lsa — bir guruh.
- Har xil buyum: biror narsa farq qilsa — alohida guruh.
- Har bir rasm faqat bitta guruhda bo'lishi kerak.
- group_images asbobini chaqir, groups massivini qaytarish.

Misol: 4 ta rasm, 0 va 2 bir xil uzuk, 1 va 3 har xil → groups: [[0,2],[1],[3]]`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { images } = await req.json();
    // images: [{base64, media_type}, ...]
    if (!images || !Array.isArray(images) || images.length < 2) {
      return json({ error: "Kamida 2 ta rasm kerak" }, 400);
    }

    // Max 10 ta rasm (token limit uchun)
    const imgs = images.slice(0, 10);

    const content: any[] = [
      { type: "text", text: `Quyida ${imgs.length} ta zargarlik rasmi bor (0 dan ${imgs.length - 1} gacha). Bir xil buyumlarni guruhlang.` },
    ];

    imgs.forEach((img: any, i: number) => {
      content.push({ type: "text", text: `Rasm ${i}:` });
      content.push({
        type: "image",
        source: { type: "base64", media_type: img.media_type || "image/webp", data: img.base64 },
      });
    });

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 400,
        temperature: 0,
        system: SYSTEM,
        tools: [TOOL],
        tool_choice: { type: "tool", name: "group_images" },
        messages: [{ role: "user", content }],
      }),
    });

    const data = await res.json();
    if (!res.ok) return json({ error: data.error?.message || "API xato" }, 500);

    const toolUse = (data.content || []).find((b: any) => b.type === "tool_use");
    if (!toolUse) return json({ error: "Natija topilmadi" }, 500);

    const groups: number[][] = toolUse.input?.groups || [];

    // Tekshirish: har bir indeks faqat bir guruhda
    const seen = new Set<number>();
    const cleaned: number[][] = [];
    for (const g of groups) {
      const valid = g.filter((i) => typeof i === "number" && i >= 0 && i < imgs.length && !seen.has(i));
      valid.forEach((i) => seen.add(i));
      if (valid.length > 0) cleaned.push(valid);
    }
    // Guruhlanmagan rasmlarni alohida qo'shish
    for (let i = 0; i < imgs.length; i++) {
      if (!seen.has(i)) cleaned.push([i]);
    }

    return json({ groups: cleaned });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

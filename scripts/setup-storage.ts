// Creates the private Supabase Storage bucket the app uploads into.
// Run once per environment: node --env-file=.env.remote node_modules/.bin/tsx scripts/setup-storage.ts
async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const name = process.env.SUPABASE_STORAGE_BUCKET || "vehicle-media";
  if (!url || !serviceKey)
    throw new Error(
      "Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de rodar.",
    );
  const headers = {
    authorization: `Bearer ${serviceKey}`,
    apikey: serviceKey,
    "content-type": "application/json",
  };
  const existing = await fetch(`${url}/storage/v1/bucket/${name}`, { headers });
  if (existing.ok) {
    console.log(`· Bucket "${name}" já existe; nada alterado.`);
    return;
  }
  const created = await fetch(`${url}/storage/v1/bucket`, {
    method: "POST",
    headers,
    // Private: reads stay behind the app's own authorization in /api/media.
    body: JSON.stringify({ name, id: name, public: false }),
  });
  if (!created.ok)
    throw new Error(
      `Falha ao criar bucket (${created.status}): ${await created.text()}`,
    );
  console.log(`✓ Bucket "${name}" criado (privado).`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : "Falha no setup");
    process.exit(1);
  });

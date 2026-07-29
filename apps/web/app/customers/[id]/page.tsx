export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div style={{ padding: '24px' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Id #{id}</h1>
      <p style={{ color: '#71717a', marginTop: '8px', fontSize: '0.875rem' }}>UI under reconstruction</p>
    </div>
  );
}

async function test() {
  const res = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@finbud.ai', password: 'admin123' })
  });
  const data = await res.json();
  console.log(data);
}
test();

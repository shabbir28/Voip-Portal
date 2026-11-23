export async function api(url, options = {}) {
  const response = await fetch(`/api${url}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Voip-Request': '1' },
    credentials: 'same-origin',
  });
  const data = await response.json();
  if (!response.ok) {
    const err = new Error(data.error || 'Request failed');
    err.status = response.status;
    throw err;
  }
  return data;
}
export const send = (url, data, method = 'POST') =>
  api(url, { method, body: JSON.stringify(data) });

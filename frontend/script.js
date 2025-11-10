const BASE_URL = 'http://localhost:1236';

document.getElementById('order-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const userId = +document.getElementById('userId').value;
  const productId = +document.getElementById('productId').value;
  const quantity = +document.getElementById('quantity').value;
  const price = +document.getElementById('price').value;

  const body = {
    userId,
    items: [{ productId, quantity, price }]
  };

  const res = await fetch(`${BASE_URL}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  document.getElementById('order-result').innerText = JSON.stringify(data, null, 2);
});

document.getElementById('pay-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const orderId = +document.getElementById('payOrderId').value;
  const amount = +document.getElementById('payAmount').value;

  const res = await fetch(`${BASE_URL}/orders/${orderId}/pay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ amount })
  });

  const data = await res.json();
  document.getElementById('pay-result').innerText = JSON.stringify(data, null, 2);
});

document.getElementById('review-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const productId = +document.getElementById('reviewProductId').value;
  const rating = +document.getElementById('rating').value;
  const comment = document.getElementById('comment').value;
  const orderId = document.getElementById('reviewOrderId').value;

  const body = { productId, rating, comment };
  if (orderId) body.orderId = +orderId;

  const res = await fetch(`${BASE_URL}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  document.getElementById('review-result').innerText = JSON.stringify(data, null, 2);
});

document.getElementById('summary-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const productId = +document.getElementById('summaryProductId').value;

  const res = await fetch(`${BASE_URL}/products/${productId}/summary`);
  const data = await res.json();
  document.getElementById('summary-result').innerText = JSON.stringify(data, null, 2);
});

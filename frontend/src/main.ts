import "./index.css";

const API = "http://127.0.0.1:1236";

async function request(path: string, opts: RequestInit = {}) {
    const res = await fetch(API + path, {
        headers: { "Content-Type": "application/json" },
        ...opts,
    });
    const data = await res.json();
    const el = document.getElementById("output")!;
    el.textContent = JSON.stringify(data, null, 2);
}

function bind() {
    (document.getElementById("btn-health") as HTMLButtonElement).onclick = () =>
        request("/health");
    (document.getElementById("btn-order") as HTMLButtonElement).onclick =
        () => {
            const body = {
                userId: 1,
                items: [
                    {
                        productId: Number(
                            (document.getElementById("pid") as HTMLInputElement)
                                .value || 101
                        ),
                        quantity: 2,
                        price: 5.5,
                    },
                ],
            };
            request("/orders", { method: "POST", body: JSON.stringify(body) });
        };
    (document.getElementById("btn-pay") as HTMLButtonElement).onclick = () => {
        const orderId = Number(
            (document.getElementById("orderId") as HTMLInputElement).value || 1
        );
        request(`/orders/${orderId}/pay`, {
            method: "POST",
            body: JSON.stringify({ amount: 20.9, provider: "VNPAY" }),
        });
    };
    (document.getElementById("btn-review") as HTMLButtonElement).onclick =
        () => {
            const orderId = Number(
                (document.getElementById("orderId") as HTMLInputElement)
                    .value || 1
            );
            const productId = Number(
                (document.getElementById("pid") as HTMLInputElement).value ||
                    101
            );
            request("/reviews", {
                method: "POST",
                body: JSON.stringify({
                    productId,
                    rating: 4.5,
                    comment: "good",
                    orderId,
                }),
            });
        };
    (
        document.getElementById("btn-summary-primary") as HTMLButtonElement
    ).onclick = () => {
        const productId = Number(
            (document.getElementById("pid") as HTMLInputElement).value || 101
        );
        request(`/products/${productId}/summary?read_from=primary`);
    };
    (
        document.getElementById("btn-summary-secondary") as HTMLButtonElement
    ).onclick = () => {
        const productId = Number(
            (document.getElementById("pid") as HTMLInputElement).value || 101
        );
        request(`/products/${productId}/summary?read_from=secondary`);
    };
    (document.getElementById("btn-stepdown") as HTMLButtonElement).onclick =
        () => {
            request("/admin/stepdown", {
                method: "POST",
                body: JSON.stringify({ seconds: 10 }),
            });
        };
}

document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div class="min-h-screen bg-gray-50 text-gray-900">
    <div class="max-w-3xl mx-auto p-6 space-y-4">
      <h1 class="text-2xl font-semibold">Ecom Demo UI</h1>
      <div class="grid grid-cols-2 gap-4">
        <div class="space-y-2">
          <label class="text-sm">Product ID</label>
          <input id="pid" class="w-full border rounded p-2" placeholder="101" />
        </div>
        <div class="space-y-2">
          <label class="text-sm">Order ID</label>
          <input id="orderId" class="w-full border rounded p-2" placeholder="1" />
        </div>
      </div>
      <div class="flex flex-wrap gap-2">
        <button id="btn-health" class="px-3 py-2 bg-black text-white rounded">Health</button>
        <button id="btn-order" class="px-3 py-2 bg-blue-600 text-white rounded">Create Order</button>
        <button id="btn-pay" class="px-3 py-2 bg-green-600 text-white rounded">Pay Order</button>
        <button id="btn-review" class="px-3 py-2 bg-amber-600 text-white rounded">Create Review</button>
        <button id="btn-summary-primary" class="px-3 py-2 bg-slate-700 text-white rounded">Summary Primary</button>
        <button id="btn-summary-secondary" class="px-3 py-2 bg-slate-500 text-white rounded">Summary Secondary</button>
        <button id="btn-stepdown" class="px-3 py-2 bg-red-600 text-white rounded">Failover StepDown</button>
      </div>
      <pre id="output" class="bg-white border rounded p-3 text-sm overflow-auto"></pre>
    </div>
  </div>
`;

bind();

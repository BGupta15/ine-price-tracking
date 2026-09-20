
const res = await fetch('http://localhost:4000/api/tracked', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    productId: 865,
    name: 'Domus Kettle XL',
    sku: 'DOM-10865',
    category: 'Kitchen',
    brand: 'Domus',
  }),
});
 
const data = await res.json();
console.log('Status:', res.status);
console.log(data);
 
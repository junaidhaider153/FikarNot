import { assertEquals, assertStringIncludes } from "@std/assert";
import { buildMime } from "../_shared/email.ts";
import { orderConfirmation, paymentConfirmed, trackingAdded } from "../_shared/emailTemplates.ts";

Deno.test("email: buildMime constructs valid multipart MIME message and sanitizes headers", () => {
  const input = {
    to: "customer@example.com\r\nBcc: evil@example.com",
    subject: "Your Order #1234\r\nInjected-Header: evil",
    replyTo: "help@fikarnot.pk\nInjected: yes",
    text: "Plain text order body",
    html: "<p>HTML order body</p>",
  };

  const mime = buildMime(input, "orders@fikarnot.pk\r\n", 'FikarNot "Store"\r\n');

  // Must not have bare CRLF header injections
  assertStringIncludes(mime, 'From: "FikarNot Store" <orders@fikarnot.pk>\r\n');
  assertStringIncludes(mime, "To: customer@example.com Bcc: evil@example.com\r\n");
  assertStringIncludes(mime, "Reply-To: help@fikarnot.pk Injected: yes\r\n");
  // Subject must be encoded as RFC 2047 base64 UTF-8
  assertStringIncludes(mime, "Subject: =?UTF-8?B?");
  // Boundary and MIME sections
  assertStringIncludes(mime, 'Content-Type: multipart/alternative; boundary="fk_');
  assertStringIncludes(mime, 'Content-Type: text/plain; charset="UTF-8"');
  assertStringIncludes(mime, 'Content-Type: text/html; charset="UTF-8"');
});

Deno.test("emailTemplates: orderConfirmation escapes HTML and handles COD vs manual payment", () => {
  const order = {
    id: "ord<script>1</script>",
    total: 3500,
    subtotal: 3250,
    shipping: 250,
    discount: 0,
    currency: "PKR",
    paymentMethod: "cod",
    customerName: 'Ahmad <img src="x" onerror="alert(1)">',
  };

  const items = [{ name: "Shirt <b>Special</b>", price: 1625, qty: 2 }];

  const emailCod = orderConfirmation(order, items);
  // HTML escaping checks
  assertStringIncludes(emailCod.html, "ord&lt;script&gt;1&lt;/script&gt;");
  assertStringIncludes(emailCod.html, "Ahmad &lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;");
  assertStringIncludes(emailCod.html, "Shirt &lt;b&gt;Special&lt;/b&gt;");
  // COD payment message
  assertStringIncludes(emailCod.html, "You will pay in cash when your order is delivered.");
  assertStringIncludes(emailCod.text, "You will pay in cash when your order is delivered.");

  // Manual payment (e.g. jazzcash)
  const manualOrder = { ...order, paymentMethod: "jazzcash" };
  const emailManual = orderConfirmation(manualOrder, items);
  assertStringIncludes(emailManual.html, "Please send your payment and upload the payment slip");
  assertStringIncludes(emailManual.text, "Please send your payment and upload the payment slip");
});

Deno.test("emailTemplates: paymentConfirmed escapes orderId", () => {
  const email = paymentConfirmed("ord-99<test>");
  assertStringIncludes(email.subject, "ord-99<test>");
  assertStringIncludes(email.html, "ord-99&lt;test&gt;");
  assertStringIncludes(email.text, "We verified your payment for order ord-99<test>.");
});

Deno.test("emailTemplates: trackingAdded escapes courier and disables javascript URLs", () => {
  const safe = trackingAdded("ord-100", "TCS <Express>", "TRK987", "https://tcs.com.pk/track/TRK987");
  assertStringIncludes(safe.html, "TCS &lt;Express&gt;");
  assertStringIncludes(safe.html, 'href="https://tcs.com.pk/track/TRK987"');

  // javascript: URL must be stripped
  const dangerous = trackingAdded("ord-100", "Courier", "TRK987", "javascript:alert(1)");
  assertEquals(dangerous.html.includes("javascript:"), false);
  assertEquals(dangerous.html.includes("Track your parcel"), false);
});

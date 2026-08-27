import { Link, useSearchParams } from "react-router-dom";
import { useDocumentMeta } from "../hooks/useDocumentMeta";
export default function PaymentResultPage({ success=false }) {
  const [params] = useSearchParams();
  const order = params.get("order");
  useDocumentMeta({ title: success ? "Payment received" : "Payment unsuccessful", noindex: true });
  return <div className="container info-page"><div className="info-hero"><span className="eyebrow">Payment</span><h1 className="display info-title">{success ? "Payment received." : "Payment was not completed."}</h1><p className="info-intro">{success ? `We received the payment callback for ${order || "your order"}. The order remains subject to server-side payment verification.` : "No payment was captured. You can return to checkout and try again."}</p></div><Link className="btn btn-dark" to={order ? "/account" : "/checkout"}>{order ? "View your account" : "Return to checkout"}</Link></div>;
}

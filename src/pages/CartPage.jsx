import { Link } from "react-router-dom";
import { useApp, appActions, cartLines } from "../store/appStore";
import { fmt } from "../utils/helpers";
import { Ic } from "../components/icons";
import { Empty, Qty } from "../components/common";

export default function CartPage() {
  const s = useApp();
  const lines = cartLines(s);
  const subtotal = +lines.reduce((t, l) => t + l.p.price * l.qty, 0).toFixed(2);
  const shipping = subtotal === 0 ? 0 : subtotal >= 75 ? 0 : 6.95;
  if (lines.length === 0) return <div className="container" style={{ padding: "60px 24px" }}><Empty icon="cart" title="Your cart is empty" sub="Fill it with objects you'll actually use." cta={<Link className="btn btn-dark" to="/products">Browse the shop</Link>} /></div>;
  return (
    <div className="container cart-layout">
      <div className="cart-lines">
        {lines.map((l) => (
          <div className="line" key={l.p.id}>
            <img src={l.p.image} alt={l.p.name} />
            <div className="line-info">
              <h4><Link to={`/product/${l.p.id}`} style={{ textDecoration: "none" }}>{l.p.name}</Link></h4>
              <p>{fmt(l.p.price)} each</p>
            </div>
            <Qty value={l.qty} set={(v) => appActions.setCartQty(l.p.id, v)} max={Math.max(1, l.p.stock)} />
            <span className="price" style={{ width: 84, textAlign: "right" }}>{fmt(l.p.price * l.qty)}</span>
            <button className="icon-btn" aria-label={`Remove ${l.p.name}`} onClick={() => appActions.removeFromCart(l.p.id)}><Ic n="trash" s={15} /></button>
          </div>
        ))}
      </div>
      <aside className="summary">
        <h3 className="display">Order summary</h3>
        <div className="sum-row"><span>Subtotal</span><span>{fmt(subtotal)}</span></div>
        <div className="sum-row"><span>Shipping</span><span>{shipping === 0 ? "Free" : fmt(shipping)}</span></div>
        {shipping === 0 && <div className="free-note">You unlocked free shipping ✦</div>}
        <div className="sum-row total"><span>Total</span><span>{fmt(+(subtotal + shipping).toFixed(2))}</span></div>
        <Link className="btn btn-lime" style={{ width: "100%", marginTop: 16 }} to="/checkout">Checkout <Ic n="arrow" s={15} /></Link>
        <Link className="btn btn-ghost" style={{ width: "100%", marginTop: 8 }} to="/products">Continue shopping</Link>
      </aside>
    </div>
  );
}


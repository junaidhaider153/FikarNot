import { Link } from "react-router-dom";
import { useApp, appActions, cartLines } from "../store/appStore";
import { fmt } from "../utils/helpers";
import { Ic } from "../components/icons";
import { Empty } from "../components/common";
import { CartItem } from "../components/CartItem";
import { getCartSummary } from "../utils/cart";

export default function CartPage() {
  const state = useApp();
  const rawLines = cartLines(state);
  const summary = getCartSummary(rawLines);

  if (summary.lines.length === 0) {
    return (
      <div className="container cart-page">
        <div className="cart-heading">
          <div>
            <p className="eyebrow">Shopping bag</p>
            <h1 className="sec-title display">Your bag is waiting.</h1>
          </div>
        </div>
        <Empty
          icon="cart"
          title="Your cart is empty"
          sub="Find something useful, beautiful, or both."
          cta={<Link className="btn btn-dark" to="/products">Browse the shop <Ic n="arrow" s={15} /></Link>}
        />
      </div>
    );
  }

  const clearCart = () => {
    if (window.confirm("Clear all items from your cart?")) {
      summary.lines.forEach(({ p }) => appActions.setCartQty(p.id, 0));
      appActions.toast("Cart cleared");
    }
  };

  return (
    <div className="container cart-page">
      <div className="cart-heading">
        <div>
          <p className="eyebrow">Shopping bag</p>
          <h1 className="sec-title display">Your cart</h1>
          <p className="cart-heading-copy">{summary.itemCount} {summary.itemCount === 1 ? "item" : "items"} ready for checkout.</p>
        </div>
        <button className="btn btn-ghost btn-sm" type="button" onClick={clearCart}>
          <Ic n="trash" s={14} /> Clear cart
        </button>
      </div>

      <div className="cart-layout">
        <section className="cart-lines" aria-label="Cart items">
          <div className="cart-free-shipping">
            <div className="cart-free-head">
              <strong>{summary.freeShippingUnlocked ? "Free shipping unlocked" : `You're ${fmt(summary.amountToFreeShipping)} away from free shipping`}</strong>
              <span>{summary.freeShippingUnlocked ? "✓" : `${summary.progress}%`}</span>
            </div>
            <div className="cart-progress" aria-hidden="true"><span style={{ width: `${summary.progress}%` }} /></div>
            <p>{summary.freeShippingUnlocked ? "Nice choice. Your order qualifies for free standard shipping." : "Spend $75 or more and standard shipping is free."}</p>
          </div>

          <div className="cart-item-list">
            {summary.lines.map((line) => <CartItem key={line.p.id} line={line} />)}
          </div>
        </section>

        <aside className="summary cart-summary">
          <div className="cart-summary-heading">
            <h2 className="display">Order summary</h2>
            <span>{summary.itemCount} {summary.itemCount === 1 ? "item" : "items"}</span>
          </div>
          <div className="sum-row"><span>Subtotal</span><span>{fmt(summary.subtotal)}</span></div>
          <div className="sum-row"><span>Shipping</span><span>{summary.shipping === 0 ? "Free" : fmt(summary.shipping)}</span></div>
          {summary.freeShippingUnlocked && <div className="free-note">You unlocked free shipping ✦</div>}
          <div className="sum-row total"><span>Total</span><span>{fmt(summary.total)}</span></div>
          <Link className="btn btn-lime cart-checkout-btn" to="/checkout"><span>Checkout</span><span>{fmt(summary.total)} <Ic n="arrow" s={15} /></span></Link>
          <Link className="btn btn-ghost cart-continue-btn" to="/products">Continue shopping</Link>
          <div className="cart-trust">
            <div><Ic n="shield" s={15} /> Secure checkout</div>
            <div><Ic n="truck" s={15} /> Free shipping over $75</div>
            <div><Ic n="check" s={15} /> 30-day returns</div>
          </div>
        </aside>
      </div>
    </div>
  );
}

import { Link, useLocation } from "react-router-dom";
import { Empty } from "../components/common";

export default function NotFoundPage() {
  const location = useLocation();

  return (
    <div className="container page-pad">
      <Empty
        icon="alert"
        title="404 — page not found"
        sub={`There is nothing at ${location.pathname}. It may have moved or never existed.`}
        cta={<Link className="btn btn-dark" to="/">Back home</Link>}
      />
    </div>
  );
}

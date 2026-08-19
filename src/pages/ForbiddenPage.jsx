import { Link } from "react-router-dom";
import { Empty } from "../components/common";

export default function ForbiddenPage() {
  return (
    <div className="container page-pad">
      <Empty
        icon="shield"
        title="Staff only"
        sub="Your account does not have permission to view this page. Ask an admin to upgrade your role."
        cta={<Link className="btn btn-dark" to="/">Back home</Link>}
      />
    </div>
  );
}

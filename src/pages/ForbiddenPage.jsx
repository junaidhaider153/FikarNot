import { Link } from "react-router-dom";
import { Empty } from "../components/common";
import { useDocumentMeta } from "../hooks/useDocumentMeta";

export default function ForbiddenPage() {
  useDocumentMeta({ title: "Access denied", noindex: true });
  return (
    <div className="container page-pad">
      <Empty
        icon="shield"
        title="Staff only"
        sub="Your account does not have permission to view this page. Ask an admin to upgrade your role."
        cta={
          <Link className="btn btn-dark" to="/">
            Back home
          </Link>
        }
      />
    </div>
  );
}

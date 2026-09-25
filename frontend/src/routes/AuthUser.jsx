import { Route, BrowserRouter as Router, Routes } from "react-router-dom";
import Chat from "../page/chat";
import ChatV2 from "../page/chatv2";
export default function AuthUser() {
  return (
    <Router>
      <Routes>
        <Route path="/">
          <Route index element={<Chat />} />
        </Route>
        <Route path="/v2" element={<ChatV2 />} />
      </Routes>
    </Router>
  );
}

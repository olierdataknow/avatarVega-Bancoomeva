import "./App.css";
import Login from "./page/login";
import AuthUser from "./routes/AuthUser";
import ChatV2 from "./page/chatv2";
import {
  AuthenticatedTemplate,
  UnauthenticatedTemplate,
} from "@azure/msal-react";

function App() {
  return (
    <>
      <ChatV2 />
    </>
  );
}

export default App;

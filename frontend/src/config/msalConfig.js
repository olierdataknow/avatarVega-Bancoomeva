import { PublicClientApplication } from "@azure/msal-browser";

export const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_CLIENT_ID, // Application (client) ID from Azure AD
    authority: `https://login.microsoftonline.com/${
      import.meta.env.VITE_TENANT_ID
    }`, // Multitenant authority
    redirectUri: import.meta.env.VITE_REDIRECT_URI, // Your redirect URI
    postLogoutRedirectUri: "/", // Indicates the page to navigate after logout.
    navigateToLoginRequestUrl: false, // If "true", will navigate back to the original request location before processing the auth code response
  },
  cache: {
    cacheLocation: "sessionStorage", // This configures where your cache will be stored
    storeAuthStateInCookie: false, // Set this to true if you are having issues on IE11 or Edge
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

export const loginRequest = {
  scopes: ["user.read"],
};

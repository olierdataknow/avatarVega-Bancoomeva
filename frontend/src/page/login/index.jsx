import React from "react";
import { PrimaryButton } from "../../components/common/Button";
import { useMsal } from "@azure/msal-react";

export default function Login() {
  const { instance } = useMsal();

  const handleSubmit = (e) => {
    e.preventDefault();
    instance.loginPopup().then(() => {
      // Handle successful login
    });
  };

  return (
    <form
      className="h-screen grid place-content-center bg-[#041F2A]"
      onSubmit={handleSubmit}
    >
      <img src="/logo.svg" alt="Logo" className="absolute top-6 left-6 w-[100px]"  />
      <div className="p-8 rounded-lg border-[0.5px] border-[#46494d] shadow w-fit text-center space-y-2 bg-[#041F2A]">
        <h1 className="text-base font-bold text-white">Bienvenido de Nuevo</h1>
        <PrimaryButton type="submit" className="!fill-[#041F2A]">
          <box-icon type="logo" name="microsoft"></box-icon>
          <span className="text-[#041F2A]">Continuar con Microsoft</span>
        </PrimaryButton>
      </div>
    </form>
  );
}

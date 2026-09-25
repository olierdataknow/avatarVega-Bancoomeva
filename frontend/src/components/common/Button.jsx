import { Button, styled } from "@mui/material";

export const PrimaryButton = styled(Button)({
  backgroundColor: "#9EC747",
  textTransform: "unset",
  color: "#00205C",
  fontWeight: "bold",
  fill: "#00205C",
  display: "flex",
  alignItems: "center",
  gap: "4px",
  "&:hover": {
    backgroundColor: "#86A63E",
  },
});

export const SecondaryButton = styled(Button)({
  backgroundColor: "#fff", // Blanco
  textTransform: "unset",
  color: "#333",
  fill: "#323232",
  fontWeight: "bold",
  border: "1px solid #ccc",
  "&:hover": {
    backgroundColor: "#f5f5f5",
  },
});

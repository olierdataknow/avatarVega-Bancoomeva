import { TextField } from "@mui/material";
import styled from "styled-components";

export const CustomTextField = styled(TextField)({
  "& .MuiInputBase-input": {
    background: "transparent",
    padding: "4px 12px",
    height: "40px",
  },
  "& .MuiInputBase-inputMultiline": {
    padding: 0,
  },
  "& label": {
    color: "#666",
  },
  "& label.Mui-focused": {
    color: "#007FFF",
  },
  "& .MuiInputBase-root": {
    color: "#333",
    backgroundColor: "transparent",
    borderRadius: 8,
  },
  "& .MuiOutlinedInput-root": {
    "& fieldset": {
      borderColor: "#CCC",
    },
    "&:hover fieldset": {
      borderColor: "#000",
    },
    "&.Mui-focused fieldset": {
      borderColor: "#000",
    },
  },
});

'use client';
import { useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";

export default function PasswordField({ resetting = false }: { resetting?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <label className="pm-login-field">{resetting ? "Nueva contraseña" : "Contraseña"}
    <div className="pm-login-input"><LockKeyhole size={16} aria-hidden="true" /><input name="password" aria-label={resetting ? "Nueva contraseña" : "Contraseña"} type={visible ? "text" : "password"} autoComplete={resetting ? "new-password" : "current-password"} placeholder={resetting ? "8+ caracteres, letra y número" : "Tu contraseña"} minLength={resetting ? 8 : 6} required />
      <button type="button" className="pm-login-password-toggle" aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}</button>
    </div>
  </label>;
}

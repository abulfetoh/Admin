import { ForgotForm } from "./form";
export const metadata = { title: "Forgot password", robots: { index: false } };
export default function Page() {
  return (<><h1 className="mb-4 text-center text-2xl font-bold">Forgot password</h1><ForgotForm /></>);
}

import { redirect } from "next/navigation";

/**
 * Redirect /policy to /privacy for TikTok portal compatibility.
 */
export default function PolicyRedirect() {
  redirect("/privacy");
}

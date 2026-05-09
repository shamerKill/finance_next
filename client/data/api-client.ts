import { TypeOption } from "./type";

// Base URL is env-driven so the client can talk to the Go gateway in dev
// (default :3001) or to a deployed gateway via NEXT_PUBLIC_API_URL in prod.
const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
const parseUrl = (path: string) => baseUrl + `/${path}`.replace("//", "/");

export const getOptions = async () => {
  const res = await fetch(parseUrl("v1/option"));
  return await res.json();
};

export const createOption = async (option: TypeOption) => {
  const res = await fetch(parseUrl("v1/option"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(option),
  });
  return await res.json();
};

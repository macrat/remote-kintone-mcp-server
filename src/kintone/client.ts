import { KintoneRestAPIClient } from "@kintone/rest-api-client";

export function createKintoneClient(credentials: {
  baseUrl: string;
  username: string;
  password: string;
}): KintoneRestAPIClient {
  return new KintoneRestAPIClient({
    baseUrl: credentials.baseUrl,
    auth: {
      username: credentials.username,
      password: credentials.password,
    },
  });
}

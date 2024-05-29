import { TypeOption } from "./type";

const baseUrl = 'http://localhost:3001/api';
const parseUrl = (path: string) => baseUrl + `/${path}`.replace('//', '/'); 

export const getOptions = async () => {
  const res = await fetch(parseUrl('v1/option'));
  return await res.json();
};
export const createOption = async (option: TypeOption) => {
  const res = await fetch(parseUrl('v1/option'), { method: 'POST', body: JSON.stringify(option) });
  return await res.json();
}

export const dataMock = {
  getOptions,
  createOption
}
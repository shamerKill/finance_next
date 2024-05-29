import { TypeOption } from "./type";

const baseUrl = 'http://localhost:3001/api';
const parseUrl = (path: string) => baseUrl + `/${path}`.replace('//', '/'); 

const getOptions = () => {
  return fetch(parseUrl('v1/option')).then(res => res.json());
};
export const createOption = async (option: TypeOption) => {
  const res = await fetch(parseUrl('v1/option'), { method: 'POST', body: JSON.stringify(option) });
  return await res.json();
}

export const dataReal = {
  getOptions,
  createOption
}
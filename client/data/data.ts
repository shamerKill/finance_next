import { dataMock } from "./data-mock";
import { dataReal } from "./data-real";
import { TypeOption } from "./type";

const isProd = process.env.NODE_ENV === 'production';

export async function getOptions() {
  const res = await (isProd ? dataReal.getOptions : dataMock.getOptions)();
  return res;
}

export async function createOption(option: TypeOption) {
  const res = await (isProd ? dataReal.createOption : dataMock.createOption)(option);
  return res;
}
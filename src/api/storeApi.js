import { getState } from "../store/appStore";
import { delay, NotFoundError } from "../utils/helpers";

export const api = {
  async listProducts() {
    await delay(180);
    return getState().products;
  },
  async listCategories() {
    await delay(140);
    return getState().categories;
  },
  async getProduct(id) {
    await delay(160);
    const product = getState().products.find((item) => item.id === id);
    if (!product) throw new NotFoundError(`Product "${id}" was not found`);
    return product;
  },
};

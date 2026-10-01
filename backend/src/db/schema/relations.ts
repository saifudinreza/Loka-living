import { relations } from "drizzle-orm";
import { productRooms, productVariants, products, rooms, testimonials } from "./catalog";
import { addresses, orderItems, orderStatusLogs, orders, shippingQuotes } from "./orders";
import { paymentTransactions } from "./payments";
import { cartItems, refreshTokens, userAddresses, users, wishlistItems } from "./users";

// Semua relasi ditaruh di satu file supaya file tabel tidak saling mengimpor melingkar.

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  addresses: many(userAddresses),
  cartItems: many(cartItems),
  wishlistItems: many(wishlistItems),
  orders: many(orders),
}));

export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, { fields: [refreshTokens.userId], references: [users.id] }),
}));

export const userAddressesRelations = relations(userAddresses, ({ one }) => ({
  user: one(users, { fields: [userAddresses.userId], references: [users.id] }),
}));

export const cartItemsRelations = relations(cartItems, ({ one }) => ({
  user: one(users, { fields: [cartItems.userId], references: [users.id] }),
  variant: one(productVariants, { fields: [cartItems.productVariantId], references: [productVariants.id] }),
}));

export const wishlistItemsRelations = relations(wishlistItems, ({ one }) => ({
  user: one(users, { fields: [wishlistItems.userId], references: [users.id] }),
  product: one(products, { fields: [wishlistItems.productId], references: [products.id] }),
}));

export const roomsRelations = relations(rooms, ({ many }) => ({
  productRooms: many(productRooms),
}));

export const productsRelations = relations(products, ({ many }) => ({
  variants: many(productVariants),
  productRooms: many(productRooms),
  testimonials: many(testimonials),
  wishlistItems: many(wishlistItems),
}));

export const productRoomsRelations = relations(productRooms, ({ one }) => ({
  product: one(products, { fields: [productRooms.productId], references: [products.id] }),
  room: one(rooms, { fields: [productRooms.roomId], references: [rooms.id] }),
}));

export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
  orderItems: many(orderItems),
  cartItems: many(cartItems),
}));

export const testimonialsRelations = relations(testimonials, ({ one }) => ({
  product: one(products, { fields: [testimonials.productId], references: [products.id] }),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  address: one(addresses, { fields: [orders.addressId], references: [addresses.id] }),
  items: many(orderItems),
  shippingQuotes: many(shippingQuotes),
  paymentTransactions: many(paymentTransactions),
  statusLogs: many(orderStatusLogs),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  variant: one(productVariants, { fields: [orderItems.productVariantId], references: [productVariants.id] }),
}));

export const shippingQuotesRelations = relations(shippingQuotes, ({ one }) => ({
  order: one(orders, { fields: [shippingQuotes.orderId], references: [orders.id] }),
}));

export const orderStatusLogsRelations = relations(orderStatusLogs, ({ one }) => ({
  order: one(orders, { fields: [orderStatusLogs.orderId], references: [orders.id] }),
}));

export const paymentTransactionsRelations = relations(paymentTransactions, ({ one }) => ({
  order: one(orders, { fields: [paymentTransactions.orderId], references: [orders.id] }),
}));

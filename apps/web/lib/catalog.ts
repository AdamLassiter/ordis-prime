import {
  findCatalogItem,
  findCatalogNode,
  listCatalogKinds,
  listCatalogNodes,
  searchCatalog as searchDatabaseCatalog,
} from "@ordis-prime/db";
import { getDatabase } from "./database";

export async function searchCatalog(input: {
  query?: string;
  kind?: string;
  page?: number;
  pageSize?: number;
}) {
  return searchDatabaseCatalog(getDatabase(), input);
}

export async function catalogKinds(query = "") {
  return listCatalogKinds(getDatabase(), query);
}

export async function findItem(kind: string, slug: string) {
  return findCatalogItem(getDatabase(), kind, slug);
}

export async function findNode(slug: string, userId?: string) {
  return findCatalogNode(getDatabase(), slug, userId);
}

export async function listNodes() {
  return listCatalogNodes(getDatabase());
}

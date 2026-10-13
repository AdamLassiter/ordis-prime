import {
  findCatalogItem,
  findCatalogNode,
  listCatalogNodes,
  searchCatalog as searchDatabaseCatalog,
} from "@ordis-prime/db";
import { getDatabase } from "./database";

export async function searchCatalog(query = "") {
  return searchDatabaseCatalog(getDatabase(), query);
}

export async function findItem(kind: string, slug: string) {
  return findCatalogItem(getDatabase(), kind, slug);
}

export async function findNode(slug: string) {
  return findCatalogNode(getDatabase(), slug);
}

export async function listNodes() {
  return listCatalogNodes(getDatabase());
}

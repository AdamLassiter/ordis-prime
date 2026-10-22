import {
  findCatalogItem,
  findCatalogNode,
  listCatalogKinds,
  listCatalogNodes,
  searchCatalog as searchDatabaseCatalog,
} from "@ordis-prime/db";
import { getDatabase } from "./database";

export async function searchCatalog(query = "", kind?: string) {
  return searchDatabaseCatalog(getDatabase(), query, 100, kind);
}

export async function catalogKinds() {
  return listCatalogKinds(getDatabase());
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

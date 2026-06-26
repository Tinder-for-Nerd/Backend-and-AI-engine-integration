import { ChromaClient } from "chromadb";

import { env } from "../config/env.js";

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
  document?: string | undefined;
}

export type GlobalSearchEntityType = "freelancer" | "project" | "startup" | "portfolio";

function createClient() {
  return new ChromaClient({ path: env.CHROMA_URL });
}

async function getCollection(name: string) {
  const client = createClient();
  return client.getOrCreateCollection({ name });
}

function normalizeQueryResults(result: {
  ids?: string[][];
  distances?: Array<Array<number | null>>;
  metadatas?: Array<Array<Record<string, unknown> | null>>;
  documents?: Array<Array<string | null>>;
}): VectorSearchResult[] {
  const ids = result.ids?.[0] ?? [];
  const distances = result.distances?.[0] ?? [];
  const metadatas = result.metadatas?.[0] ?? [];
  const documents = result.documents?.[0] ?? [];

  return ids.map((id, index) => ({
    id,
    score: Math.max(0, 1 - Number(distances[index] ?? 1)),
    metadata: metadatas[index] ?? {},
    document: documents[index] ?? undefined,
  }));
}

function cleanMetadata(metadata: Record<string, string | number | boolean | null | undefined>) {
  return Object.fromEntries(
    Object.entries(metadata).filter((entry): entry is [string, string | number | boolean] => entry[1] !== null && entry[1] !== undefined),
  );
}

export function profileVectorId(freelancerId: string) {
  return `profile:${freelancerId}`;
}

export function projectVectorId(projectId: string) {
  return `project:${projectId}`;
}

export function globalVectorId(entityType: GlobalSearchEntityType, entityId: string) {
  return `global:${entityType}:${entityId}`;
}

export async function upsertProfileVector(input: {
  freelancerId: string;
  embedding: number[];
  document: string;
  sourceHash: string;
}) {
  const collection = await getCollection(env.CHROMA_PROFILE_COLLECTION);
  const id = profileVectorId(input.freelancerId);
  await collection.upsert({
    ids: [id],
    embeddings: [input.embedding],
    documents: [input.document],
    metadatas: [{ freelancerId: input.freelancerId, sourceHash: input.sourceHash, kind: "profile" }],
  });
  return id;
}

export async function upsertProjectVector(input: {
  projectId: string;
  embedding: number[];
  document: string;
  sourceHash: string;
}) {
  const collection = await getCollection(env.CHROMA_PROJECT_COLLECTION);
  const id = projectVectorId(input.projectId);
  await collection.upsert({
    ids: [id],
    embeddings: [input.embedding],
    documents: [input.document],
    metadatas: [{ projectId: input.projectId, sourceHash: input.sourceHash, kind: "project" }],
  });
  return id;
}

export async function queryProfilesByEmbedding(embedding: number[], limit: number) {
  const collection = await getCollection(env.CHROMA_PROFILE_COLLECTION);
  const result = await collection.query({
    queryEmbeddings: [embedding],
    nResults: limit,
    include: ["distances", "metadatas", "documents"],
  });
  return normalizeQueryResults(result);
}

export async function upsertGlobalSearchVector(input: {
  entityType: GlobalSearchEntityType;
  entityId: string;
  embedding: number[];
  document: string;
  sourceHash: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
}) {
  const collection = await getCollection(env.CHROMA_GLOBAL_COLLECTION);
  const id = globalVectorId(input.entityType, input.entityId);
  const metadata = cleanMetadata({
    entityType: input.entityType,
    entityId: input.entityId,
    sourceHash: input.sourceHash,
    ...input.metadata,
  });
  await collection.upsert({
    ids: [id],
    embeddings: [input.embedding],
    documents: [input.document],
    metadatas: [metadata],
  });
  return id;
}

export async function queryGlobalSearchByEmbedding(embedding: number[], limit: number) {
  const collection = await getCollection(env.CHROMA_GLOBAL_COLLECTION);
  const result = await collection.query({
    queryEmbeddings: [embedding],
    nResults: limit,
    include: ["distances", "metadatas", "documents"],
  });
  return normalizeQueryResults(result);
}

export async function deleteProfileVector(freelancerId: string) {
  const collection = await getCollection(env.CHROMA_PROFILE_COLLECTION);
  await collection.delete({ ids: [profileVectorId(freelancerId)] });
}

export async function deleteProjectVector(projectId: string) {
  const collection = await getCollection(env.CHROMA_PROJECT_COLLECTION);
  await collection.delete({ ids: [projectVectorId(projectId)] });
}

export async function deleteGlobalSearchVector(entityType: GlobalSearchEntityType, entityId: string) {
  const collection = await getCollection(env.CHROMA_GLOBAL_COLLECTION);
  await collection.delete({ ids: [globalVectorId(entityType, entityId)] });
}

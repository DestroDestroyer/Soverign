export interface Triple {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  source?: string;
  timestamp?: number;
}

export interface GraphExtractor {
  readonly name: string;
  extract(text: string): Promise<Triple[]>;
}

export interface GraphStore {
  insert(triple: Triple): Promise<void>;
  bulkInsert(triples: Triple[]): Promise<void>;
  query(sparql: string): Promise<Triple[]>;
  findBySubject(subject: string): Promise<Triple[]>;
  findByObject(object: string): Promise<Triple[]>;
  findByPredicate(predicate: string): Promise<Triple[]>;
  search(query: string): Promise<Triple[]>;
  clear(): Promise<void>;
  stats(): Promise<{ total: number; uniqueSubjects: number; uniquePredicates: number }>;
}

export type $InferMapValue<T> = T extends { get(key: any): (infer V) | undefined } ? V : never;

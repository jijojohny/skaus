declare module 'circomlibjs' {
  export function buildPoseidon(): Promise<any>;
}

declare module 'snarkjs' {
  export const groth16: {
    fullProve(input: Record<string, any>, wasmFile: string, zkeyFile: string): Promise<{
      proof: { pi_a: string[]; pi_b: string[][]; pi_c: string[] };
      publicSignals: string[];
    }>;
  };
}

export interface TRPCHookResult {
    trpc: {
        path: string;
    };
}
/**
 * Makes a stable reference of the `trpc` prop
 */
export declare function useHookResult(value: TRPCHookResult['trpc']): TRPCHookResult['trpc'];
//# sourceMappingURL=useHookResult.d.ts.map
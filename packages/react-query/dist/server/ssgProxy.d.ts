import type { DehydratedState, DehydrateOptions, InfiniteData, QueryClient } from '@tanstack/react-query';
import type { AnyProcedure, AnyQueryProcedure, AnyRouter, Filter, inferHandlerInput, ProtectedIntersection } from '@trpc/server';
import type { inferTransformedProcedureOutput } from '@trpc/server/shared';
import type { CreateServerSideHelpersOptions } from './types';
type DecorateProcedure<TProcedure extends AnyProcedure> = {
    /**
     * @link https://tanstack.com/query/v4/docs/react/guides/prefetching
     */
    fetch(...args: inferHandlerInput<TProcedure>): Promise<inferTransformedProcedureOutput<TProcedure>>;
    /**
     * @link https://tanstack.com/query/v4/docs/react/guides/prefetching
     */
    fetchInfinite(...args: inferHandlerInput<TProcedure>): Promise<InfiniteData<inferTransformedProcedureOutput<TProcedure>>>;
    /**
     * @link https://tanstack.com/query/v4/docs/react/guides/prefetching
     */
    prefetch(...args: inferHandlerInput<TProcedure>): Promise<void>;
    /**
     * @link https://tanstack.com/query/v4/docs/react/guides/prefetching
     */
    prefetchInfinite(...args: inferHandlerInput<TProcedure>): Promise<void>;
};
/**
 * @internal
 */
export type DecoratedProcedureSSGRecord<TRouter extends AnyRouter> = {
    [TKey in keyof Filter<TRouter['_def']['record'], AnyQueryProcedure | AnyRouter>]: TRouter['_def']['record'][TKey] extends AnyRouter ? DecoratedProcedureSSGRecord<TRouter['_def']['record'][TKey]> : DecorateProcedure<TRouter['_def']['record'][TKey]>;
};
/**
 * Create functions you can use for server-side rendering / static generation
 * @see https://trpc.io/docs/client/nextjs/server-side-helpers
 */
export declare function createServerSideHelpers<TRouter extends AnyRouter>(opts: CreateServerSideHelpersOptions<TRouter>): ProtectedIntersection<{
    queryClient: QueryClient;
    dehydrate: (opts?: DehydrateOptions) => DehydratedState;
}, DecoratedProcedureSSGRecord<TRouter>>;
export {};
//# sourceMappingURL=ssgProxy.d.ts.map
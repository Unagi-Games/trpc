import type { AnyRouter } from '@trpc/server';
import type { CreateTRPCReact } from './createTRPCReact';
import type { CreateTRPCReactOptions } from './shared';
import type { CreateReactQueryHooks } from './shared/hooks/createRootHooks';
/**
 * @deprecated use `createTRPCReact` instead
 */
export declare function createReactQueryHooks<TRouter extends AnyRouter, TSSRContext = unknown, TFlags = null>(opts?: CreateTRPCReactOptions<TRouter>): CreateReactQueryHooks<TRouter, TSSRContext> & {
    proxy: CreateTRPCReact<TRouter, TSSRContext, TFlags>;
};
//# sourceMappingURL=interop.d.ts.map
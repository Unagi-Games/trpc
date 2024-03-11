import { createRecursiveProxy, createFlatProxy } from '@trpc/server/shared';
import { g as getArrayQueryKey, c as contextProps, T as TRPCContext } from './context-4557b3d3.js';
import { createTRPCClientProxy, createTRPCClient } from '@trpc/client';
import { useQuery, useQueryClient, useMutation, hashQueryKey, useInfiniteQuery, useQueries } from '@tanstack/react-query';
import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';

/**
 * We treat `undefined` as an input the same as omitting an `input`
 * https://github.com/trpc/trpc/issues/2290
 */
function getQueryKeyInternal(path, input) {
    if (path.length)
        return input === undefined ? [path] : [path, input];
    return [];
}
/**
 * Method to extract the query key for a procedure
 * @param procedureOrRouter - procedure or AnyRouter
 * @param input - input to procedureOrRouter
 * @param type - defaults to `any`
 * @link https://trpc.io/docs/getQueryKey
 */
function getQueryKey(..._params) {
    const [procedureOrRouter, input, type] = _params;
    // @ts-expect-error - we don't expose _def on the type layer
    const path = procedureOrRouter._def().path;
    const dotPath = path.join('.');
    const queryKey = getArrayQueryKey(getQueryKeyInternal(dotPath, input), type ?? 'any');
    return queryKey;
}

/**
 * Create proxy for decorating procedures
 * @internal
 */
function createReactProxyDecoration(name, hooks) {
    return createRecursiveProxy((opts) => {
        const args = opts.args;
        const pathCopy = [name, ...opts.path];
        // The last arg is for instance `.useMutation` or `.useQuery()`
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const lastArg = pathCopy.pop();
        // The `path` ends up being something like `post.byId`
        const path = pathCopy.join('.');
        if (lastArg === 'useMutation') {
            return hooks[lastArg](path, ...args);
        }
        const [input, ...rest] = args;
        const queryKey = getQueryKeyInternal(path, input);
        // Expose queryKey helper
        if (lastArg === 'getQueryKey') {
            return getArrayQueryKey(queryKey, rest[0] ?? 'any');
        }
        if (lastArg === '_def') {
            return {
                path: pathCopy,
            };
        }
        if (lastArg.startsWith('useSuspense')) {
            const opts = rest[0] || {};
            const fn = lastArg === 'useSuspenseQuery' ? 'useQuery' : 'useInfiniteQuery';
            const result = hooks[fn](queryKey, {
                ...opts,
                suspense: true,
                enabled: true,
            });
            return [result.data, result];
        }
        return hooks[lastArg](queryKey, ...rest);
    });
}

/**
 * @internal
 */
function createReactQueryUtilsProxy(context) {
    return createFlatProxy((key) => {
        const contextName = key;
        if (contextName === 'client') {
            return createTRPCClientProxy(context.client);
        }
        if (contextProps.includes(contextName)) {
            return context[contextName];
        }
        return createRecursiveProxy(({ path, args }) => {
            const pathCopy = [key, ...path];
            const utilName = pathCopy.pop();
            const fullPath = pathCopy.join('.');
            const getOpts = (name) => {
                if (['setData', 'setInfiniteData'].includes(name)) {
                    const [input, updater, ...rest] = args;
                    const queryKey = getQueryKeyInternal(fullPath, input);
                    return {
                        queryKey,
                        updater,
                        rest,
                    };
                }
                const [input, ...rest] = args;
                const queryKey = getQueryKeyInternal(fullPath, input);
                return {
                    queryKey,
                    rest,
                };
            };
            const { queryKey, rest, updater } = getOpts(utilName);
            const contextMap = {
                fetch: () => context.fetchQuery(queryKey, ...rest),
                fetchInfinite: () => context.fetchInfiniteQuery(queryKey, ...rest),
                prefetch: () => context.prefetchQuery(queryKey, ...rest),
                prefetchInfinite: () => context.prefetchInfiniteQuery(queryKey, ...rest),
                ensureData: () => context.ensureQueryData(queryKey, ...rest),
                invalidate: () => context.invalidateQueries(queryKey, ...rest),
                reset: () => context.resetQueries(queryKey, ...rest),
                refetch: () => context.refetchQueries(queryKey, ...rest),
                cancel: () => context.cancelQuery(queryKey, ...rest),
                setData: () => {
                    context.setQueryData(queryKey, updater, ...rest);
                },
                setInfiniteData: () => {
                    context.setInfiniteQueryData(queryKey, updater, ...rest);
                },
                getData: () => context.getQueryData(queryKey),
                getInfiniteData: () => context.getInfiniteQueryData(queryKey),
            };
            return contextMap[utilName]();
        });
    });
}

/**
 * Create proxy for `useQueries` options
 * @internal
 */
function createUseQueriesProxy(client) {
    return createRecursiveProxy((opts) => {
        const path = opts.path.join('.');
        const [input, _opts] = opts.args;
        const queryKey = getQueryKeyInternal(path, input);
        const options = {
            queryKey,
            queryFn: () => {
                return client.query(path, input, _opts?.trpc);
            },
            ..._opts,
        };
        return options;
    });
}

function getClientArgs(pathAndInput, opts) {
    const [path, input] = pathAndInput;
    return [path, input, opts?.trpc];
}

/**
 * Makes a stable reference of the `trpc` prop
 */
function useHookResult(value) {
    const { path } = value;
    return useMemo(() => ({ path }), [path]);
}

/**
 * @internal
 */
function createRootHooks(config) {
    const mutationSuccessOverride = (config?.overrides ?? config?.unstable_overrides)?.useMutation?.onSuccess ??
        ((options) => options.originalFn());
    const Context = (config?.context ??
        TRPCContext);
    const ReactQueryContext = config?.reactQueryContext;
    const createClient = (opts) => {
        return createTRPCClient(opts);
    };
    const TRPCProvider = (props) => {
        const { abortOnUnmount = false, client, queryClient, ssrContext } = props;
        const [ssrState, setSSRState] = useState(props.ssrState ?? false);
        useEffect(() => {
            // Only updating state to `mounted` if we are using SSR.
            // This makes it so we don't have an unnecessary re-render when opting out of SSR.
            setSSRState((state) => (state ? 'mounted' : false));
        }, []);
        return (React.createElement(Context.Provider, { value: {
                abortOnUnmount,
                queryClient,
                client,
                ssrContext: ssrContext ?? null,
                ssrState,
                fetchQuery: useCallback((pathAndInput, opts) => {
                    return queryClient.fetchQuery({
                        ...opts,
                        queryKey: getArrayQueryKey(pathAndInput, 'query'),
                        queryFn: () => client.query(...getClientArgs(pathAndInput, opts)),
                    });
                }, [client, queryClient]),
                fetchInfiniteQuery: useCallback((pathAndInput, opts) => {
                    return queryClient.fetchInfiniteQuery({
                        ...opts,
                        queryKey: getArrayQueryKey(pathAndInput, 'infinite'),
                        queryFn: ({ pageParam }) => {
                            const [path, input] = pathAndInput;
                            const actualInput = { ...input, cursor: pageParam };
                            return client.query(...getClientArgs([path, actualInput], opts));
                        },
                    });
                }, [client, queryClient]),
                prefetchQuery: useCallback((pathAndInput, opts) => {
                    return queryClient.prefetchQuery({
                        ...opts,
                        queryKey: getArrayQueryKey(pathAndInput, 'query'),
                        queryFn: () => client.query(...getClientArgs(pathAndInput, opts)),
                    });
                }, [client, queryClient]),
                prefetchInfiniteQuery: useCallback((pathAndInput, opts) => {
                    return queryClient.prefetchInfiniteQuery({
                        ...opts,
                        queryKey: getArrayQueryKey(pathAndInput, 'infinite'),
                        queryFn: ({ pageParam }) => {
                            const [path, input] = pathAndInput;
                            const actualInput = { ...input, cursor: pageParam };
                            return client.query(...getClientArgs([path, actualInput], opts));
                        },
                    });
                }, [client, queryClient]),
                ensureQueryData: useCallback((pathAndInput, opts) => {
                    return queryClient.ensureQueryData({
                        ...opts,
                        queryKey: getArrayQueryKey(pathAndInput, 'query'),
                        queryFn: () => client.query(...getClientArgs(pathAndInput, opts)),
                    });
                }, [client, queryClient]),
                invalidateQueries: useCallback((queryKey, filters, options) => {
                    return queryClient.invalidateQueries({
                        ...filters,
                        queryKey: getArrayQueryKey(queryKey, 'any'),
                    }, options);
                }, [queryClient]),
                resetQueries: useCallback((...args) => {
                    const [queryKey, filters, options] = args;
                    return queryClient.resetQueries({
                        ...filters,
                        queryKey: getArrayQueryKey(queryKey, 'any'),
                    }, options);
                }, [queryClient]),
                refetchQueries: useCallback((...args) => {
                    const [queryKey, filters, options] = args;
                    return queryClient.refetchQueries({
                        ...filters,
                        queryKey: getArrayQueryKey(queryKey, 'any'),
                    }, options);
                }, [queryClient]),
                cancelQuery: useCallback((pathAndInput) => {
                    return queryClient.cancelQueries({
                        queryKey: getArrayQueryKey(pathAndInput, 'any'),
                    });
                }, [queryClient]),
                setQueryData: useCallback((...args) => {
                    const [queryKey, ...rest] = args;
                    return queryClient.setQueryData(getArrayQueryKey(queryKey, 'query'), ...rest);
                }, [queryClient]),
                getQueryData: useCallback((...args) => {
                    const [queryKey, ...rest] = args;
                    return queryClient.getQueryData(getArrayQueryKey(queryKey, 'query'), ...rest);
                }, [queryClient]),
                setInfiniteQueryData: useCallback((...args) => {
                    const [queryKey, ...rest] = args;
                    return queryClient.setQueryData(getArrayQueryKey(queryKey, 'infinite'), ...rest);
                }, [queryClient]),
                getInfiniteQueryData: useCallback((...args) => {
                    const [queryKey, ...rest] = args;
                    return queryClient.getQueryData(getArrayQueryKey(queryKey, 'infinite'), ...rest);
                }, [queryClient]),
            } }, props.children));
    };
    function useContext() {
        return React.useContext(Context);
    }
    /**
     * Hack to make sure errors return `status`='error` when doing SSR
     * @link https://github.com/trpc/trpc/pull/1645
     */
    function useSSRQueryOptionsIfNeeded(pathAndInput, type, opts) {
        const { queryClient, ssrState } = useContext();
        return ssrState &&
            ssrState !== 'mounted' &&
            queryClient.getQueryCache().find(getArrayQueryKey(pathAndInput, type))
                ?.state.status === 'error'
            ? {
                retryOnMount: false,
                ...opts,
            }
            : opts;
    }
    function useQuery$1(
    // FIXME path should be a tuple in next major
    pathAndInput, opts) {
        const context = useContext();
        if (!context) {
            throw new Error('Unable to retrieve application context. Did you forget to wrap your App inside `withTRPC` HoC?');
        }
        const { abortOnUnmount, client, ssrState, queryClient, prefetchQuery } = context;
        const defaultOpts = queryClient.getQueryDefaults(getArrayQueryKey(pathAndInput, 'query'));
        if (typeof window === 'undefined' &&
            ssrState === 'prepass' &&
            opts?.trpc?.ssr !== false &&
            (opts?.enabled ?? defaultOpts?.enabled) !== false &&
            !queryClient.getQueryCache().find(getArrayQueryKey(pathAndInput, 'query'))) {
            void prefetchQuery(pathAndInput, opts);
        }
        const ssrOpts = useSSRQueryOptionsIfNeeded(pathAndInput, 'query', {
            ...defaultOpts,
            ...opts,
        });
        const shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? config?.abortOnUnmount ?? abortOnUnmount;
        const hook = useQuery({
            ...ssrOpts,
            queryKey: getArrayQueryKey(pathAndInput, 'query'),
            queryFn: (queryFunctionContext) => {
                const actualOpts = {
                    ...ssrOpts,
                    trpc: {
                        ...ssrOpts?.trpc,
                        ...(shouldAbortOnUnmount
                            ? { signal: queryFunctionContext.signal }
                            : {}),
                    },
                };
                return client.query(...getClientArgs(pathAndInput, actualOpts));
            },
            context: ReactQueryContext,
        });
        hook.trpc = useHookResult({
            path: pathAndInput[0],
        });
        return hook;
    }
    function useMutation$1(
    // FIXME: this should only be a tuple path in next major
    path, opts) {
        const { client } = useContext();
        const queryClient = useQueryClient({ context: ReactQueryContext });
        const actualPath = Array.isArray(path) ? path[0] : path;
        const defaultOpts = queryClient.getMutationDefaults([
            actualPath.split('.'),
        ]);
        const hook = useMutation({
            ...opts,
            mutationKey: [actualPath.split('.')],
            mutationFn: (input) => {
                return client.mutation(...getClientArgs([actualPath, input], opts));
            },
            context: ReactQueryContext,
            onSuccess(...args) {
                const originalFn = () => opts?.onSuccess?.(...args) ?? defaultOpts?.onSuccess?.(...args);
                return mutationSuccessOverride({
                    originalFn,
                    queryClient,
                    meta: opts?.meta ?? defaultOpts?.meta ?? {},
                });
            },
        });
        hook.trpc = useHookResult({
            path: actualPath,
        });
        return hook;
    }
    /* istanbul ignore next -- @preserve */
    function useSubscription(pathAndInput, opts) {
        const enabled = opts?.enabled ?? true;
        const queryKey = hashQueryKey(pathAndInput);
        const { client } = useContext();
        const optsRef = useRef(opts);
        optsRef.current = opts;
        useEffect(() => {
            if (!enabled) {
                return;
            }
            const [path, input] = pathAndInput;
            let isStopped = false;
            const subscription = client.subscription(path, (input ?? undefined), {
                onStarted: () => {
                    if (!isStopped) {
                        optsRef.current.onStarted?.();
                    }
                },
                onData: (data) => {
                    if (!isStopped) {
                        // FIXME this shouldn't be needed as both should be `unknown` in next major
                        optsRef.current.onData(data);
                    }
                },
                onError: (err) => {
                    if (!isStopped) {
                        optsRef.current.onError?.(err);
                    }
                },
            });
            return () => {
                isStopped = true;
                subscription.unsubscribe();
            };
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [queryKey, enabled]);
    }
    function useInfiniteQuery$1(pathAndInput, opts) {
        const [path, input] = pathAndInput;
        const { client, ssrState, prefetchInfiniteQuery, queryClient, abortOnUnmount, } = useContext();
        const defaultOpts = queryClient.getQueryDefaults(getArrayQueryKey(pathAndInput, 'infinite'));
        if (typeof window === 'undefined' &&
            ssrState === 'prepass' &&
            opts?.trpc?.ssr !== false &&
            (opts?.enabled ?? defaultOpts?.enabled) !== false &&
            !queryClient
                .getQueryCache()
                .find(getArrayQueryKey(pathAndInput, 'infinite'))) {
            void prefetchInfiniteQuery(pathAndInput, { ...defaultOpts, ...opts });
        }
        const ssrOpts = useSSRQueryOptionsIfNeeded(pathAndInput, 'infinite', {
            ...defaultOpts,
            ...opts,
        });
        // request option should take priority over global
        const shouldAbortOnUnmount = opts?.trpc?.abortOnUnmount ?? abortOnUnmount;
        const hook = useInfiniteQuery({
            ...ssrOpts,
            queryKey: getArrayQueryKey(pathAndInput, 'infinite'),
            queryFn: (queryFunctionContext) => {
                const actualOpts = {
                    ...ssrOpts,
                    trpc: {
                        ...ssrOpts?.trpc,
                        ...(shouldAbortOnUnmount
                            ? { signal: queryFunctionContext.signal }
                            : {}),
                    },
                };
                const actualInput = {
                    ...(input ?? {}),
                    cursor: queryFunctionContext.pageParam ?? opts?.initialCursor,
                };
                // FIXME as any shouldn't be needed as client should be untyped too
                return client.query(...getClientArgs([path, actualInput], actualOpts));
            },
            context: ReactQueryContext,
        });
        hook.trpc = useHookResult({
            path,
        });
        return hook;
    }
    const useQueries$1 = (queriesCallback, context) => {
        const { ssrState, queryClient, prefetchQuery, client } = useContext();
        const proxy = createUseQueriesProxy(client);
        const queries = queriesCallback(proxy);
        if (typeof window === 'undefined' && ssrState === 'prepass') {
            for (const query of queries) {
                const queryOption = query;
                if (queryOption.trpc?.ssr !== false &&
                    !queryClient
                        .getQueryCache()
                        .find(getArrayQueryKey(queryOption.queryKey, 'query'))) {
                    void prefetchQuery(queryOption.queryKey, queryOption);
                }
            }
        }
        return useQueries({
            queries: queries.map((query) => ({
                ...query,
                queryKey: getArrayQueryKey(query.queryKey, 'query'),
            })),
            context,
        });
    };
    const useDehydratedState = (client, trpcState) => {
        const transformed = useMemo(() => {
            if (!trpcState) {
                return trpcState;
            }
            return client.runtime.transformer.deserialize(trpcState);
        }, [trpcState, client]);
        return transformed;
    };
    return {
        Provider: TRPCProvider,
        createClient,
        useContext,
        useUtils: useContext,
        useQuery: useQuery$1,
        useQueries: useQueries$1,
        useMutation: useMutation$1,
        useSubscription,
        useDehydratedState,
        useInfiniteQuery: useInfiniteQuery$1,
    };
}

/**
 * Create strongly typed react hooks
 * @internal
 * @deprecated
 */
function createHooksInternal(config) {
    return createRootHooks(config);
}

export { createReactQueryUtilsProxy as a, createReactProxyDecoration as b, createHooksInternal as c, getClientArgs as d, createUseQueriesProxy as e, createRootHooks as f, getQueryKey as g };

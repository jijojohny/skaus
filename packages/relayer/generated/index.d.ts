
/**
 * Client
**/

import * as runtime from './runtime/library.js';
import $Types = runtime.Types // general types
import $Public = runtime.Types.Public
import $Utils = runtime.Types.Utils
import $Extensions = runtime.Types.Extensions
import $Result = runtime.Types.Result

export type PrismaPromise<T> = $Public.PrismaPromise<T>


/**
 * Model WithdrawalJob
 * 
 */
export type WithdrawalJob = $Result.DefaultSelection<Prisma.$WithdrawalJobPayload>

/**
 * ##  Prisma Client ʲˢ
 * 
 * Type-safe database client for TypeScript & Node.js
 * @example
 * ```
 * const prisma = new PrismaClient()
 * // Fetch zero or more WithdrawalJobs
 * const withdrawalJobs = await prisma.withdrawalJob.findMany()
 * ```
 *
 * 
 * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
 */
export class PrismaClient<
  ClientOptions extends Prisma.PrismaClientOptions = Prisma.PrismaClientOptions,
  U = 'log' extends keyof ClientOptions ? ClientOptions['log'] extends Array<Prisma.LogLevel | Prisma.LogDefinition> ? Prisma.GetEvents<ClientOptions['log']> : never : never,
  ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs
> {
  [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['other'] }

    /**
   * ##  Prisma Client ʲˢ
   * 
   * Type-safe database client for TypeScript & Node.js
   * @example
   * ```
   * const prisma = new PrismaClient()
   * // Fetch zero or more WithdrawalJobs
   * const withdrawalJobs = await prisma.withdrawalJob.findMany()
   * ```
   *
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client).
   */

  constructor(optionsArg ?: Prisma.Subset<ClientOptions, Prisma.PrismaClientOptions>);
  $on<V extends U>(eventType: V, callback: (event: V extends 'query' ? Prisma.QueryEvent : Prisma.LogEvent) => void): void;

  /**
   * Connect with the database
   */
  $connect(): $Utils.JsPromise<void>;

  /**
   * Disconnect from the database
   */
  $disconnect(): $Utils.JsPromise<void>;

  /**
   * Add a middleware
   * @deprecated since 4.16.0. For new code, prefer client extensions instead.
   * @see https://pris.ly/d/extensions
   */
  $use(cb: Prisma.Middleware): void

/**
   * Executes a prepared raw query and returns the number of affected rows.
   * @example
   * ```
   * const result = await prisma.$executeRaw`UPDATE User SET cool = ${true} WHERE email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Executes a raw query and returns the number of affected rows.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$executeRawUnsafe('UPDATE User SET cool = $1 WHERE email = $2 ;', true, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $executeRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<number>;

  /**
   * Performs a prepared raw query and returns the `SELECT` data.
   * @example
   * ```
   * const result = await prisma.$queryRaw`SELECT * FROM User WHERE id = ${1} OR email = ${'user@email.com'};`
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRaw<T = unknown>(query: TemplateStringsArray | Prisma.Sql, ...values: any[]): Prisma.PrismaPromise<T>;

  /**
   * Performs a raw query and returns the `SELECT` data.
   * Susceptible to SQL injections, see documentation.
   * @example
   * ```
   * const result = await prisma.$queryRawUnsafe('SELECT * FROM User WHERE id = $1 OR email = $2;', 1, 'user@email.com')
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/raw-database-access).
   */
  $queryRawUnsafe<T = unknown>(query: string, ...values: any[]): Prisma.PrismaPromise<T>;


  /**
   * Allows the running of a sequence of read/write operations that are guaranteed to either succeed or fail as a whole.
   * @example
   * ```
   * const [george, bob, alice] = await prisma.$transaction([
   *   prisma.user.create({ data: { name: 'George' } }),
   *   prisma.user.create({ data: { name: 'Bob' } }),
   *   prisma.user.create({ data: { name: 'Alice' } }),
   * ])
   * ```
   * 
   * Read more in our [docs](https://www.prisma.io/docs/concepts/components/prisma-client/transactions).
   */
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arg: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<runtime.Types.Utils.UnwrapTuple<P>>

  $transaction<R>(fn: (prisma: Omit<PrismaClient, runtime.ITXClientDenyList>) => $Utils.JsPromise<R>, options?: { maxWait?: number, timeout?: number, isolationLevel?: Prisma.TransactionIsolationLevel }): $Utils.JsPromise<R>


  $extends: $Extensions.ExtendsHook<"extends", Prisma.TypeMapCb, ExtArgs>

      /**
   * `prisma.withdrawalJob`: Exposes CRUD operations for the **WithdrawalJob** model.
    * Example usage:
    * ```ts
    * // Fetch zero or more WithdrawalJobs
    * const withdrawalJobs = await prisma.withdrawalJob.findMany()
    * ```
    */
  get withdrawalJob(): Prisma.WithdrawalJobDelegate<ExtArgs>;
}

export namespace Prisma {
  export import DMMF = runtime.DMMF

  export type PrismaPromise<T> = $Public.PrismaPromise<T>

  /**
   * Validator
   */
  export import validator = runtime.Public.validator

  /**
   * Prisma Errors
   */
  export import PrismaClientKnownRequestError = runtime.PrismaClientKnownRequestError
  export import PrismaClientUnknownRequestError = runtime.PrismaClientUnknownRequestError
  export import PrismaClientRustPanicError = runtime.PrismaClientRustPanicError
  export import PrismaClientInitializationError = runtime.PrismaClientInitializationError
  export import PrismaClientValidationError = runtime.PrismaClientValidationError
  export import NotFoundError = runtime.NotFoundError

  /**
   * Re-export of sql-template-tag
   */
  export import sql = runtime.sqltag
  export import empty = runtime.empty
  export import join = runtime.join
  export import raw = runtime.raw
  export import Sql = runtime.Sql



  /**
   * Decimal.js
   */
  export import Decimal = runtime.Decimal

  export type DecimalJsLike = runtime.DecimalJsLike

  /**
   * Metrics 
   */
  export type Metrics = runtime.Metrics
  export type Metric<T> = runtime.Metric<T>
  export type MetricHistogram = runtime.MetricHistogram
  export type MetricHistogramBucket = runtime.MetricHistogramBucket

  /**
  * Extensions
  */
  export import Extension = $Extensions.UserArgs
  export import getExtensionContext = runtime.Extensions.getExtensionContext
  export import Args = $Public.Args
  export import Payload = $Public.Payload
  export import Result = $Public.Result
  export import Exact = $Public.Exact

  /**
   * Prisma Client JS version: 5.22.0
   * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
   */
  export type PrismaVersion = {
    client: string
  }

  export const prismaVersion: PrismaVersion 

  /**
   * Utility Types
   */


  export import JsonObject = runtime.JsonObject
  export import JsonArray = runtime.JsonArray
  export import JsonValue = runtime.JsonValue
  export import InputJsonObject = runtime.InputJsonObject
  export import InputJsonArray = runtime.InputJsonArray
  export import InputJsonValue = runtime.InputJsonValue

  /**
   * Types of the values used to represent different kinds of `null` values when working with JSON fields.
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  namespace NullTypes {
    /**
    * Type of `Prisma.DbNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.DbNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class DbNull {
      private DbNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.JsonNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.JsonNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class JsonNull {
      private JsonNull: never
      private constructor()
    }

    /**
    * Type of `Prisma.AnyNull`.
    * 
    * You cannot use other instances of this class. Please use the `Prisma.AnyNull` value.
    * 
    * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
    */
    class AnyNull {
      private AnyNull: never
      private constructor()
    }
  }

  /**
   * Helper for filtering JSON entries that have `null` on the database (empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const DbNull: NullTypes.DbNull

  /**
   * Helper for filtering JSON entries that have JSON `null` values (not empty on the db)
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const JsonNull: NullTypes.JsonNull

  /**
   * Helper for filtering JSON entries that are `Prisma.DbNull` or `Prisma.JsonNull`
   * 
   * @see https://www.prisma.io/docs/concepts/components/prisma-client/working-with-fields/working-with-json-fields#filtering-on-a-json-field
   */
  export const AnyNull: NullTypes.AnyNull

  type SelectAndInclude = {
    select: any
    include: any
  }

  type SelectAndOmit = {
    select: any
    omit: any
  }

  /**
   * Get the type of the value, that the Promise holds.
   */
  export type PromiseType<T extends PromiseLike<any>> = T extends PromiseLike<infer U> ? U : T;

  /**
   * Get the return type of a function which returns a Promise.
   */
  export type PromiseReturnType<T extends (...args: any) => $Utils.JsPromise<any>> = PromiseType<ReturnType<T>>

  /**
   * From T, pick a set of properties whose keys are in the union K
   */
  type Prisma__Pick<T, K extends keyof T> = {
      [P in K]: T[P];
  };


  export type Enumerable<T> = T | Array<T>;

  export type RequiredKeys<T> = {
    [K in keyof T]-?: {} extends Prisma__Pick<T, K> ? never : K
  }[keyof T]

  export type TruthyKeys<T> = keyof {
    [K in keyof T as T[K] extends false | undefined | null ? never : K]: K
  }

  export type TrueKeys<T> = TruthyKeys<Prisma__Pick<T, RequiredKeys<T>>>

  /**
   * Subset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection
   */
  export type Subset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never;
  };

  /**
   * SelectSubset
   * @desc From `T` pick properties that exist in `U`. Simple version of Intersection.
   * Additionally, it validates, if both select and include are present. If the case, it errors.
   */
  export type SelectSubset<T, U> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    (T extends SelectAndInclude
      ? 'Please either choose `select` or `include`.'
      : T extends SelectAndOmit
        ? 'Please either choose `select` or `omit`.'
        : {})

  /**
   * Subset + Intersection
   * @desc From `T` pick properties that exist in `U` and intersect `K`
   */
  export type SubsetIntersection<T, U, K> = {
    [key in keyof T]: key extends keyof U ? T[key] : never
  } &
    K

  type Without<T, U> = { [P in Exclude<keyof T, keyof U>]?: never };

  /**
   * XOR is needed to have a real mutually exclusive union type
   * https://stackoverflow.com/questions/42123407/does-typescript-support-mutually-exclusive-types
   */
  type XOR<T, U> =
    T extends object ?
    U extends object ?
      (Without<T, U> & U) | (Without<U, T> & T)
    : U : T


  /**
   * Is T a Record?
   */
  type IsObject<T extends any> = T extends Array<any>
  ? False
  : T extends Date
  ? False
  : T extends Uint8Array
  ? False
  : T extends BigInt
  ? False
  : T extends object
  ? True
  : False


  /**
   * If it's T[], return T
   */
  export type UnEnumerate<T extends unknown> = T extends Array<infer U> ? U : T

  /**
   * From ts-toolbelt
   */

  type __Either<O extends object, K extends Key> = Omit<O, K> &
    {
      // Merge all but K
      [P in K]: Prisma__Pick<O, P & keyof O> // With K possibilities
    }[K]

  type EitherStrict<O extends object, K extends Key> = Strict<__Either<O, K>>

  type EitherLoose<O extends object, K extends Key> = ComputeRaw<__Either<O, K>>

  type _Either<
    O extends object,
    K extends Key,
    strict extends Boolean
  > = {
    1: EitherStrict<O, K>
    0: EitherLoose<O, K>
  }[strict]

  type Either<
    O extends object,
    K extends Key,
    strict extends Boolean = 1
  > = O extends unknown ? _Either<O, K, strict> : never

  export type Union = any

  type PatchUndefined<O extends object, O1 extends object> = {
    [K in keyof O]: O[K] extends undefined ? At<O1, K> : O[K]
  } & {}

  /** Helper Types for "Merge" **/
  export type IntersectOf<U extends Union> = (
    U extends unknown ? (k: U) => void : never
  ) extends (k: infer I) => void
    ? I
    : never

  export type Overwrite<O extends object, O1 extends object> = {
      [K in keyof O]: K extends keyof O1 ? O1[K] : O[K];
  } & {};

  type _Merge<U extends object> = IntersectOf<Overwrite<U, {
      [K in keyof U]-?: At<U, K>;
  }>>;

  type Key = string | number | symbol;
  type AtBasic<O extends object, K extends Key> = K extends keyof O ? O[K] : never;
  type AtStrict<O extends object, K extends Key> = O[K & keyof O];
  type AtLoose<O extends object, K extends Key> = O extends unknown ? AtStrict<O, K> : never;
  export type At<O extends object, K extends Key, strict extends Boolean = 1> = {
      1: AtStrict<O, K>;
      0: AtLoose<O, K>;
  }[strict];

  export type ComputeRaw<A extends any> = A extends Function ? A : {
    [K in keyof A]: A[K];
  } & {};

  export type OptionalFlat<O> = {
    [K in keyof O]?: O[K];
  } & {};

  type _Record<K extends keyof any, T> = {
    [P in K]: T;
  };

  // cause typescript not to expand types and preserve names
  type NoExpand<T> = T extends unknown ? T : never;

  // this type assumes the passed object is entirely optional
  type AtLeast<O extends object, K extends string> = NoExpand<
    O extends unknown
    ? | (K extends keyof O ? { [P in K]: O[P] } & O : O)
      | {[P in keyof O as P extends K ? K : never]-?: O[P]} & O
    : never>;

  type _Strict<U, _U = U> = U extends unknown ? U & OptionalFlat<_Record<Exclude<Keys<_U>, keyof U>, never>> : never;

  export type Strict<U extends object> = ComputeRaw<_Strict<U>>;
  /** End Helper Types for "Merge" **/

  export type Merge<U extends object> = ComputeRaw<_Merge<Strict<U>>>;

  /**
  A [[Boolean]]
  */
  export type Boolean = True | False

  // /**
  // 1
  // */
  export type True = 1

  /**
  0
  */
  export type False = 0

  export type Not<B extends Boolean> = {
    0: 1
    1: 0
  }[B]

  export type Extends<A1 extends any, A2 extends any> = [A1] extends [never]
    ? 0 // anything `never` is false
    : A1 extends A2
    ? 1
    : 0

  export type Has<U extends Union, U1 extends Union> = Not<
    Extends<Exclude<U1, U>, U1>
  >

  export type Or<B1 extends Boolean, B2 extends Boolean> = {
    0: {
      0: 0
      1: 1
    }
    1: {
      0: 1
      1: 1
    }
  }[B1][B2]

  export type Keys<U extends Union> = U extends unknown ? keyof U : never

  type Cast<A, B> = A extends B ? A : B;

  export const type: unique symbol;



  /**
   * Used by group by
   */

  export type GetScalarType<T, O> = O extends object ? {
    [P in keyof T]: P extends keyof O
      ? O[P]
      : never
  } : never

  type FieldPaths<
    T,
    U = Omit<T, '_avg' | '_sum' | '_count' | '_min' | '_max'>
  > = IsObject<T> extends True ? U : T

  type GetHavingFields<T> = {
    [K in keyof T]: Or<
      Or<Extends<'OR', K>, Extends<'AND', K>>,
      Extends<'NOT', K>
    > extends True
      ? // infer is only needed to not hit TS limit
        // based on the brilliant idea of Pierre-Antoine Mills
        // https://github.com/microsoft/TypeScript/issues/30188#issuecomment-478938437
        T[K] extends infer TK
        ? GetHavingFields<UnEnumerate<TK> extends object ? Merge<UnEnumerate<TK>> : never>
        : never
      : {} extends FieldPaths<T[K]>
      ? never
      : K
  }[keyof T]

  /**
   * Convert tuple to union
   */
  type _TupleToUnion<T> = T extends (infer E)[] ? E : never
  type TupleToUnion<K extends readonly any[]> = _TupleToUnion<K>
  type MaybeTupleToUnion<T> = T extends any[] ? TupleToUnion<T> : T

  /**
   * Like `Pick`, but additionally can also accept an array of keys
   */
  type PickEnumerable<T, K extends Enumerable<keyof T> | keyof T> = Prisma__Pick<T, MaybeTupleToUnion<K>>

  /**
   * Exclude all keys with underscores
   */
  type ExcludeUnderscoreKeys<T extends string> = T extends `_${string}` ? never : T


  export type FieldRef<Model, FieldType> = runtime.FieldRef<Model, FieldType>

  type FieldRefInputType<Model, FieldType> = Model extends never ? never : FieldRef<Model, FieldType>


  export const ModelName: {
    WithdrawalJob: 'WithdrawalJob'
  };

  export type ModelName = (typeof ModelName)[keyof typeof ModelName]


  export type Datasources = {
    db?: Datasource
  }

  interface TypeMapCb extends $Utils.Fn<{extArgs: $Extensions.InternalArgs, clientOptions: PrismaClientOptions }, $Utils.Record<string, any>> {
    returns: Prisma.TypeMap<this['params']['extArgs'], this['params']['clientOptions']>
  }

  export type TypeMap<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs, ClientOptions = {}> = {
    meta: {
      modelProps: "withdrawalJob"
      txIsolationLevel: Prisma.TransactionIsolationLevel
    }
    model: {
      WithdrawalJob: {
        payload: Prisma.$WithdrawalJobPayload<ExtArgs>
        fields: Prisma.WithdrawalJobFieldRefs
        operations: {
          findUnique: {
            args: Prisma.WithdrawalJobFindUniqueArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WithdrawalJobPayload> | null
          }
          findUniqueOrThrow: {
            args: Prisma.WithdrawalJobFindUniqueOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WithdrawalJobPayload>
          }
          findFirst: {
            args: Prisma.WithdrawalJobFindFirstArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WithdrawalJobPayload> | null
          }
          findFirstOrThrow: {
            args: Prisma.WithdrawalJobFindFirstOrThrowArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WithdrawalJobPayload>
          }
          findMany: {
            args: Prisma.WithdrawalJobFindManyArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WithdrawalJobPayload>[]
          }
          create: {
            args: Prisma.WithdrawalJobCreateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WithdrawalJobPayload>
          }
          createMany: {
            args: Prisma.WithdrawalJobCreateManyArgs<ExtArgs>
            result: BatchPayload
          }
          createManyAndReturn: {
            args: Prisma.WithdrawalJobCreateManyAndReturnArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WithdrawalJobPayload>[]
          }
          delete: {
            args: Prisma.WithdrawalJobDeleteArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WithdrawalJobPayload>
          }
          update: {
            args: Prisma.WithdrawalJobUpdateArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WithdrawalJobPayload>
          }
          deleteMany: {
            args: Prisma.WithdrawalJobDeleteManyArgs<ExtArgs>
            result: BatchPayload
          }
          updateMany: {
            args: Prisma.WithdrawalJobUpdateManyArgs<ExtArgs>
            result: BatchPayload
          }
          upsert: {
            args: Prisma.WithdrawalJobUpsertArgs<ExtArgs>
            result: $Utils.PayloadToResult<Prisma.$WithdrawalJobPayload>
          }
          aggregate: {
            args: Prisma.WithdrawalJobAggregateArgs<ExtArgs>
            result: $Utils.Optional<AggregateWithdrawalJob>
          }
          groupBy: {
            args: Prisma.WithdrawalJobGroupByArgs<ExtArgs>
            result: $Utils.Optional<WithdrawalJobGroupByOutputType>[]
          }
          count: {
            args: Prisma.WithdrawalJobCountArgs<ExtArgs>
            result: $Utils.Optional<WithdrawalJobCountAggregateOutputType> | number
          }
        }
      }
    }
  } & {
    other: {
      payload: any
      operations: {
        $executeRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $executeRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
        $queryRaw: {
          args: [query: TemplateStringsArray | Prisma.Sql, ...values: any[]],
          result: any
        }
        $queryRawUnsafe: {
          args: [query: string, ...values: any[]],
          result: any
        }
      }
    }
  }
  export const defineExtension: $Extensions.ExtendsHook<"define", Prisma.TypeMapCb, $Extensions.DefaultArgs>
  export type DefaultPrismaClient = PrismaClient
  export type ErrorFormat = 'pretty' | 'colorless' | 'minimal'
  export interface PrismaClientOptions {
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasources?: Datasources
    /**
     * Overwrites the datasource url from your schema.prisma file
     */
    datasourceUrl?: string
    /**
     * @default "colorless"
     */
    errorFormat?: ErrorFormat
    /**
     * @example
     * ```
     * // Defaults to stdout
     * log: ['query', 'info', 'warn', 'error']
     * 
     * // Emit as events
     * log: [
     *   { emit: 'stdout', level: 'query' },
     *   { emit: 'stdout', level: 'info' },
     *   { emit: 'stdout', level: 'warn' }
     *   { emit: 'stdout', level: 'error' }
     * ]
     * ```
     * Read more in our [docs](https://www.prisma.io/docs/reference/tools-and-interfaces/prisma-client/logging#the-log-option).
     */
    log?: (LogLevel | LogDefinition)[]
    /**
     * The default values for transactionOptions
     * maxWait ?= 2000
     * timeout ?= 5000
     */
    transactionOptions?: {
      maxWait?: number
      timeout?: number
      isolationLevel?: Prisma.TransactionIsolationLevel
    }
  }


  /* Types for Logging */
  export type LogLevel = 'info' | 'query' | 'warn' | 'error'
  export type LogDefinition = {
    level: LogLevel
    emit: 'stdout' | 'event'
  }

  export type GetLogType<T extends LogLevel | LogDefinition> = T extends LogDefinition ? T['emit'] extends 'event' ? T['level'] : never : never
  export type GetEvents<T extends any> = T extends Array<LogLevel | LogDefinition> ?
    GetLogType<T[0]> | GetLogType<T[1]> | GetLogType<T[2]> | GetLogType<T[3]>
    : never

  export type QueryEvent = {
    timestamp: Date
    query: string
    params: string
    duration: number
    target: string
  }

  export type LogEvent = {
    timestamp: Date
    message: string
    target: string
  }
  /* End Types for Logging */


  export type PrismaAction =
    | 'findUnique'
    | 'findUniqueOrThrow'
    | 'findMany'
    | 'findFirst'
    | 'findFirstOrThrow'
    | 'create'
    | 'createMany'
    | 'createManyAndReturn'
    | 'update'
    | 'updateMany'
    | 'upsert'
    | 'delete'
    | 'deleteMany'
    | 'executeRaw'
    | 'queryRaw'
    | 'aggregate'
    | 'count'
    | 'runCommandRaw'
    | 'findRaw'
    | 'groupBy'

  /**
   * These options are being passed into the middleware as "params"
   */
  export type MiddlewareParams = {
    model?: ModelName
    action: PrismaAction
    args: any
    dataPath: string[]
    runInTransaction: boolean
  }

  /**
   * The `T` type makes sure, that the `return proceed` is not forgotten in the middleware implementation
   */
  export type Middleware<T = any> = (
    params: MiddlewareParams,
    next: (params: MiddlewareParams) => $Utils.JsPromise<T>,
  ) => $Utils.JsPromise<T>

  // tested in getLogLevel.test.ts
  export function getLogLevel(log: Array<LogLevel | LogDefinition>): LogLevel | undefined;

  /**
   * `PrismaClient` proxy available in interactive transactions.
   */
  export type TransactionClient = Omit<Prisma.DefaultPrismaClient, runtime.ITXClientDenyList>

  export type Datasource = {
    url?: string
  }

  /**
   * Count Types
   */



  /**
   * Models
   */

  /**
   * Model WithdrawalJob
   */

  export type AggregateWithdrawalJob = {
    _count: WithdrawalJobCountAggregateOutputType | null
    _avg: WithdrawalJobAvgAggregateOutputType | null
    _sum: WithdrawalJobSumAggregateOutputType | null
    _min: WithdrawalJobMinAggregateOutputType | null
    _max: WithdrawalJobMaxAggregateOutputType | null
  }

  export type WithdrawalJobAvgAggregateOutputType = {
    attempts: number | null
  }

  export type WithdrawalJobSumAggregateOutputType = {
    attempts: number | null
  }

  export type WithdrawalJobMinAggregateOutputType = {
    id: string | null
    proofBase64: string | null
    merkleRoot: string | null
    nullifierHash: string | null
    recipient: string | null
    amount: string | null
    fee: string | null
    tokenMint: string | null
    status: string | null
    txSignature: string | null
    attempts: number | null
    lastError: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type WithdrawalJobMaxAggregateOutputType = {
    id: string | null
    proofBase64: string | null
    merkleRoot: string | null
    nullifierHash: string | null
    recipient: string | null
    amount: string | null
    fee: string | null
    tokenMint: string | null
    status: string | null
    txSignature: string | null
    attempts: number | null
    lastError: string | null
    createdAt: Date | null
    updatedAt: Date | null
  }

  export type WithdrawalJobCountAggregateOutputType = {
    id: number
    proofBase64: number
    merkleRoot: number
    nullifierHash: number
    recipient: number
    amount: number
    fee: number
    tokenMint: number
    status: number
    txSignature: number
    attempts: number
    lastError: number
    createdAt: number
    updatedAt: number
    _all: number
  }


  export type WithdrawalJobAvgAggregateInputType = {
    attempts?: true
  }

  export type WithdrawalJobSumAggregateInputType = {
    attempts?: true
  }

  export type WithdrawalJobMinAggregateInputType = {
    id?: true
    proofBase64?: true
    merkleRoot?: true
    nullifierHash?: true
    recipient?: true
    amount?: true
    fee?: true
    tokenMint?: true
    status?: true
    txSignature?: true
    attempts?: true
    lastError?: true
    createdAt?: true
    updatedAt?: true
  }

  export type WithdrawalJobMaxAggregateInputType = {
    id?: true
    proofBase64?: true
    merkleRoot?: true
    nullifierHash?: true
    recipient?: true
    amount?: true
    fee?: true
    tokenMint?: true
    status?: true
    txSignature?: true
    attempts?: true
    lastError?: true
    createdAt?: true
    updatedAt?: true
  }

  export type WithdrawalJobCountAggregateInputType = {
    id?: true
    proofBase64?: true
    merkleRoot?: true
    nullifierHash?: true
    recipient?: true
    amount?: true
    fee?: true
    tokenMint?: true
    status?: true
    txSignature?: true
    attempts?: true
    lastError?: true
    createdAt?: true
    updatedAt?: true
    _all?: true
  }

  export type WithdrawalJobAggregateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which WithdrawalJob to aggregate.
     */
    where?: WithdrawalJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WithdrawalJobs to fetch.
     */
    orderBy?: WithdrawalJobOrderByWithRelationInput | WithdrawalJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the start position
     */
    cursor?: WithdrawalJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WithdrawalJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WithdrawalJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Count returned WithdrawalJobs
    **/
    _count?: true | WithdrawalJobCountAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to average
    **/
    _avg?: WithdrawalJobAvgAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to sum
    **/
    _sum?: WithdrawalJobSumAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the minimum value
    **/
    _min?: WithdrawalJobMinAggregateInputType
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/aggregations Aggregation Docs}
     * 
     * Select which fields to find the maximum value
    **/
    _max?: WithdrawalJobMaxAggregateInputType
  }

  export type GetWithdrawalJobAggregateType<T extends WithdrawalJobAggregateArgs> = {
        [P in keyof T & keyof AggregateWithdrawalJob]: P extends '_count' | 'count'
      ? T[P] extends true
        ? number
        : GetScalarType<T[P], AggregateWithdrawalJob[P]>
      : GetScalarType<T[P], AggregateWithdrawalJob[P]>
  }




  export type WithdrawalJobGroupByArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    where?: WithdrawalJobWhereInput
    orderBy?: WithdrawalJobOrderByWithAggregationInput | WithdrawalJobOrderByWithAggregationInput[]
    by: WithdrawalJobScalarFieldEnum[] | WithdrawalJobScalarFieldEnum
    having?: WithdrawalJobScalarWhereWithAggregatesInput
    take?: number
    skip?: number
    _count?: WithdrawalJobCountAggregateInputType | true
    _avg?: WithdrawalJobAvgAggregateInputType
    _sum?: WithdrawalJobSumAggregateInputType
    _min?: WithdrawalJobMinAggregateInputType
    _max?: WithdrawalJobMaxAggregateInputType
  }

  export type WithdrawalJobGroupByOutputType = {
    id: string
    proofBase64: string
    merkleRoot: string
    nullifierHash: string
    recipient: string
    amount: string
    fee: string
    tokenMint: string
    status: string
    txSignature: string | null
    attempts: number
    lastError: string | null
    createdAt: Date
    updatedAt: Date
    _count: WithdrawalJobCountAggregateOutputType | null
    _avg: WithdrawalJobAvgAggregateOutputType | null
    _sum: WithdrawalJobSumAggregateOutputType | null
    _min: WithdrawalJobMinAggregateOutputType | null
    _max: WithdrawalJobMaxAggregateOutputType | null
  }

  type GetWithdrawalJobGroupByPayload<T extends WithdrawalJobGroupByArgs> = Prisma.PrismaPromise<
    Array<
      PickEnumerable<WithdrawalJobGroupByOutputType, T['by']> &
        {
          [P in ((keyof T) & (keyof WithdrawalJobGroupByOutputType))]: P extends '_count'
            ? T[P] extends boolean
              ? number
              : GetScalarType<T[P], WithdrawalJobGroupByOutputType[P]>
            : GetScalarType<T[P], WithdrawalJobGroupByOutputType[P]>
        }
      >
    >


  export type WithdrawalJobSelect<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    proofBase64?: boolean
    merkleRoot?: boolean
    nullifierHash?: boolean
    recipient?: boolean
    amount?: boolean
    fee?: boolean
    tokenMint?: boolean
    status?: boolean
    txSignature?: boolean
    attempts?: boolean
    lastError?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["withdrawalJob"]>

  export type WithdrawalJobSelectCreateManyAndReturn<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = $Extensions.GetSelect<{
    id?: boolean
    proofBase64?: boolean
    merkleRoot?: boolean
    nullifierHash?: boolean
    recipient?: boolean
    amount?: boolean
    fee?: boolean
    tokenMint?: boolean
    status?: boolean
    txSignature?: boolean
    attempts?: boolean
    lastError?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }, ExtArgs["result"]["withdrawalJob"]>

  export type WithdrawalJobSelectScalar = {
    id?: boolean
    proofBase64?: boolean
    merkleRoot?: boolean
    nullifierHash?: boolean
    recipient?: boolean
    amount?: boolean
    fee?: boolean
    tokenMint?: boolean
    status?: boolean
    txSignature?: boolean
    attempts?: boolean
    lastError?: boolean
    createdAt?: boolean
    updatedAt?: boolean
  }


  export type $WithdrawalJobPayload<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    name: "WithdrawalJob"
    objects: {}
    scalars: $Extensions.GetPayloadResult<{
      id: string
      proofBase64: string
      merkleRoot: string
      nullifierHash: string
      recipient: string
      amount: string
      fee: string
      tokenMint: string
      status: string
      txSignature: string | null
      attempts: number
      lastError: string | null
      createdAt: Date
      updatedAt: Date
    }, ExtArgs["result"]["withdrawalJob"]>
    composites: {}
  }

  type WithdrawalJobGetPayload<S extends boolean | null | undefined | WithdrawalJobDefaultArgs> = $Result.GetResult<Prisma.$WithdrawalJobPayload, S>

  type WithdrawalJobCountArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = 
    Omit<WithdrawalJobFindManyArgs, 'select' | 'include' | 'distinct'> & {
      select?: WithdrawalJobCountAggregateInputType | true
    }

  export interface WithdrawalJobDelegate<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> {
    [K: symbol]: { types: Prisma.TypeMap<ExtArgs>['model']['WithdrawalJob'], meta: { name: 'WithdrawalJob' } }
    /**
     * Find zero or one WithdrawalJob that matches the filter.
     * @param {WithdrawalJobFindUniqueArgs} args - Arguments to find a WithdrawalJob
     * @example
     * // Get one WithdrawalJob
     * const withdrawalJob = await prisma.withdrawalJob.findUnique({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUnique<T extends WithdrawalJobFindUniqueArgs>(args: SelectSubset<T, WithdrawalJobFindUniqueArgs<ExtArgs>>): Prisma__WithdrawalJobClient<$Result.GetResult<Prisma.$WithdrawalJobPayload<ExtArgs>, T, "findUnique"> | null, null, ExtArgs>

    /**
     * Find one WithdrawalJob that matches the filter or throw an error with `error.code='P2025'` 
     * if no matches were found.
     * @param {WithdrawalJobFindUniqueOrThrowArgs} args - Arguments to find a WithdrawalJob
     * @example
     * // Get one WithdrawalJob
     * const withdrawalJob = await prisma.withdrawalJob.findUniqueOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findUniqueOrThrow<T extends WithdrawalJobFindUniqueOrThrowArgs>(args: SelectSubset<T, WithdrawalJobFindUniqueOrThrowArgs<ExtArgs>>): Prisma__WithdrawalJobClient<$Result.GetResult<Prisma.$WithdrawalJobPayload<ExtArgs>, T, "findUniqueOrThrow">, never, ExtArgs>

    /**
     * Find the first WithdrawalJob that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WithdrawalJobFindFirstArgs} args - Arguments to find a WithdrawalJob
     * @example
     * // Get one WithdrawalJob
     * const withdrawalJob = await prisma.withdrawalJob.findFirst({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirst<T extends WithdrawalJobFindFirstArgs>(args?: SelectSubset<T, WithdrawalJobFindFirstArgs<ExtArgs>>): Prisma__WithdrawalJobClient<$Result.GetResult<Prisma.$WithdrawalJobPayload<ExtArgs>, T, "findFirst"> | null, null, ExtArgs>

    /**
     * Find the first WithdrawalJob that matches the filter or
     * throw `PrismaKnownClientError` with `P2025` code if no matches were found.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WithdrawalJobFindFirstOrThrowArgs} args - Arguments to find a WithdrawalJob
     * @example
     * // Get one WithdrawalJob
     * const withdrawalJob = await prisma.withdrawalJob.findFirstOrThrow({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     */
    findFirstOrThrow<T extends WithdrawalJobFindFirstOrThrowArgs>(args?: SelectSubset<T, WithdrawalJobFindFirstOrThrowArgs<ExtArgs>>): Prisma__WithdrawalJobClient<$Result.GetResult<Prisma.$WithdrawalJobPayload<ExtArgs>, T, "findFirstOrThrow">, never, ExtArgs>

    /**
     * Find zero or more WithdrawalJobs that matches the filter.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WithdrawalJobFindManyArgs} args - Arguments to filter and select certain fields only.
     * @example
     * // Get all WithdrawalJobs
     * const withdrawalJobs = await prisma.withdrawalJob.findMany()
     * 
     * // Get first 10 WithdrawalJobs
     * const withdrawalJobs = await prisma.withdrawalJob.findMany({ take: 10 })
     * 
     * // Only select the `id`
     * const withdrawalJobWithIdOnly = await prisma.withdrawalJob.findMany({ select: { id: true } })
     * 
     */
    findMany<T extends WithdrawalJobFindManyArgs>(args?: SelectSubset<T, WithdrawalJobFindManyArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WithdrawalJobPayload<ExtArgs>, T, "findMany">>

    /**
     * Create a WithdrawalJob.
     * @param {WithdrawalJobCreateArgs} args - Arguments to create a WithdrawalJob.
     * @example
     * // Create one WithdrawalJob
     * const WithdrawalJob = await prisma.withdrawalJob.create({
     *   data: {
     *     // ... data to create a WithdrawalJob
     *   }
     * })
     * 
     */
    create<T extends WithdrawalJobCreateArgs>(args: SelectSubset<T, WithdrawalJobCreateArgs<ExtArgs>>): Prisma__WithdrawalJobClient<$Result.GetResult<Prisma.$WithdrawalJobPayload<ExtArgs>, T, "create">, never, ExtArgs>

    /**
     * Create many WithdrawalJobs.
     * @param {WithdrawalJobCreateManyArgs} args - Arguments to create many WithdrawalJobs.
     * @example
     * // Create many WithdrawalJobs
     * const withdrawalJob = await prisma.withdrawalJob.createMany({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     *     
     */
    createMany<T extends WithdrawalJobCreateManyArgs>(args?: SelectSubset<T, WithdrawalJobCreateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create many WithdrawalJobs and returns the data saved in the database.
     * @param {WithdrawalJobCreateManyAndReturnArgs} args - Arguments to create many WithdrawalJobs.
     * @example
     * // Create many WithdrawalJobs
     * const withdrawalJob = await prisma.withdrawalJob.createManyAndReturn({
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * 
     * // Create many WithdrawalJobs and only return the `id`
     * const withdrawalJobWithIdOnly = await prisma.withdrawalJob.createManyAndReturn({ 
     *   select: { id: true },
     *   data: [
     *     // ... provide data here
     *   ]
     * })
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * 
     */
    createManyAndReturn<T extends WithdrawalJobCreateManyAndReturnArgs>(args?: SelectSubset<T, WithdrawalJobCreateManyAndReturnArgs<ExtArgs>>): Prisma.PrismaPromise<$Result.GetResult<Prisma.$WithdrawalJobPayload<ExtArgs>, T, "createManyAndReturn">>

    /**
     * Delete a WithdrawalJob.
     * @param {WithdrawalJobDeleteArgs} args - Arguments to delete one WithdrawalJob.
     * @example
     * // Delete one WithdrawalJob
     * const WithdrawalJob = await prisma.withdrawalJob.delete({
     *   where: {
     *     // ... filter to delete one WithdrawalJob
     *   }
     * })
     * 
     */
    delete<T extends WithdrawalJobDeleteArgs>(args: SelectSubset<T, WithdrawalJobDeleteArgs<ExtArgs>>): Prisma__WithdrawalJobClient<$Result.GetResult<Prisma.$WithdrawalJobPayload<ExtArgs>, T, "delete">, never, ExtArgs>

    /**
     * Update one WithdrawalJob.
     * @param {WithdrawalJobUpdateArgs} args - Arguments to update one WithdrawalJob.
     * @example
     * // Update one WithdrawalJob
     * const withdrawalJob = await prisma.withdrawalJob.update({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    update<T extends WithdrawalJobUpdateArgs>(args: SelectSubset<T, WithdrawalJobUpdateArgs<ExtArgs>>): Prisma__WithdrawalJobClient<$Result.GetResult<Prisma.$WithdrawalJobPayload<ExtArgs>, T, "update">, never, ExtArgs>

    /**
     * Delete zero or more WithdrawalJobs.
     * @param {WithdrawalJobDeleteManyArgs} args - Arguments to filter WithdrawalJobs to delete.
     * @example
     * // Delete a few WithdrawalJobs
     * const { count } = await prisma.withdrawalJob.deleteMany({
     *   where: {
     *     // ... provide filter here
     *   }
     * })
     * 
     */
    deleteMany<T extends WithdrawalJobDeleteManyArgs>(args?: SelectSubset<T, WithdrawalJobDeleteManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Update zero or more WithdrawalJobs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WithdrawalJobUpdateManyArgs} args - Arguments to update one or more rows.
     * @example
     * // Update many WithdrawalJobs
     * const withdrawalJob = await prisma.withdrawalJob.updateMany({
     *   where: {
     *     // ... provide filter here
     *   },
     *   data: {
     *     // ... provide data here
     *   }
     * })
     * 
     */
    updateMany<T extends WithdrawalJobUpdateManyArgs>(args: SelectSubset<T, WithdrawalJobUpdateManyArgs<ExtArgs>>): Prisma.PrismaPromise<BatchPayload>

    /**
     * Create or update one WithdrawalJob.
     * @param {WithdrawalJobUpsertArgs} args - Arguments to update or create a WithdrawalJob.
     * @example
     * // Update or create a WithdrawalJob
     * const withdrawalJob = await prisma.withdrawalJob.upsert({
     *   create: {
     *     // ... data to create a WithdrawalJob
     *   },
     *   update: {
     *     // ... in case it already exists, update
     *   },
     *   where: {
     *     // ... the filter for the WithdrawalJob we want to update
     *   }
     * })
     */
    upsert<T extends WithdrawalJobUpsertArgs>(args: SelectSubset<T, WithdrawalJobUpsertArgs<ExtArgs>>): Prisma__WithdrawalJobClient<$Result.GetResult<Prisma.$WithdrawalJobPayload<ExtArgs>, T, "upsert">, never, ExtArgs>


    /**
     * Count the number of WithdrawalJobs.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WithdrawalJobCountArgs} args - Arguments to filter WithdrawalJobs to count.
     * @example
     * // Count the number of WithdrawalJobs
     * const count = await prisma.withdrawalJob.count({
     *   where: {
     *     // ... the filter for the WithdrawalJobs we want to count
     *   }
     * })
    **/
    count<T extends WithdrawalJobCountArgs>(
      args?: Subset<T, WithdrawalJobCountArgs>,
    ): Prisma.PrismaPromise<
      T extends $Utils.Record<'select', any>
        ? T['select'] extends true
          ? number
          : GetScalarType<T['select'], WithdrawalJobCountAggregateOutputType>
        : number
    >

    /**
     * Allows you to perform aggregations operations on a WithdrawalJob.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WithdrawalJobAggregateArgs} args - Select which aggregations you would like to apply and on what fields.
     * @example
     * // Ordered by age ascending
     * // Where email contains prisma.io
     * // Limited to the 10 users
     * const aggregations = await prisma.user.aggregate({
     *   _avg: {
     *     age: true,
     *   },
     *   where: {
     *     email: {
     *       contains: "prisma.io",
     *     },
     *   },
     *   orderBy: {
     *     age: "asc",
     *   },
     *   take: 10,
     * })
    **/
    aggregate<T extends WithdrawalJobAggregateArgs>(args: Subset<T, WithdrawalJobAggregateArgs>): Prisma.PrismaPromise<GetWithdrawalJobAggregateType<T>>

    /**
     * Group by WithdrawalJob.
     * Note, that providing `undefined` is treated as the value not being there.
     * Read more here: https://pris.ly/d/null-undefined
     * @param {WithdrawalJobGroupByArgs} args - Group by arguments.
     * @example
     * // Group by city, order by createdAt, get count
     * const result = await prisma.user.groupBy({
     *   by: ['city', 'createdAt'],
     *   orderBy: {
     *     createdAt: true
     *   },
     *   _count: {
     *     _all: true
     *   },
     * })
     * 
    **/
    groupBy<
      T extends WithdrawalJobGroupByArgs,
      HasSelectOrTake extends Or<
        Extends<'skip', Keys<T>>,
        Extends<'take', Keys<T>>
      >,
      OrderByArg extends True extends HasSelectOrTake
        ? { orderBy: WithdrawalJobGroupByArgs['orderBy'] }
        : { orderBy?: WithdrawalJobGroupByArgs['orderBy'] },
      OrderFields extends ExcludeUnderscoreKeys<Keys<MaybeTupleToUnion<T['orderBy']>>>,
      ByFields extends MaybeTupleToUnion<T['by']>,
      ByValid extends Has<ByFields, OrderFields>,
      HavingFields extends GetHavingFields<T['having']>,
      HavingValid extends Has<ByFields, HavingFields>,
      ByEmpty extends T['by'] extends never[] ? True : False,
      InputErrors extends ByEmpty extends True
      ? `Error: "by" must not be empty.`
      : HavingValid extends False
      ? {
          [P in HavingFields]: P extends ByFields
            ? never
            : P extends string
            ? `Error: Field "${P}" used in "having" needs to be provided in "by".`
            : [
                Error,
                'Field ',
                P,
                ` in "having" needs to be provided in "by"`,
              ]
        }[HavingFields]
      : 'take' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "take", you also need to provide "orderBy"'
      : 'skip' extends Keys<T>
      ? 'orderBy' extends Keys<T>
        ? ByValid extends True
          ? {}
          : {
              [P in OrderFields]: P extends ByFields
                ? never
                : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
            }[OrderFields]
        : 'Error: If you provide "skip", you also need to provide "orderBy"'
      : ByValid extends True
      ? {}
      : {
          [P in OrderFields]: P extends ByFields
            ? never
            : `Error: Field "${P}" in "orderBy" needs to be provided in "by"`
        }[OrderFields]
    >(args: SubsetIntersection<T, WithdrawalJobGroupByArgs, OrderByArg> & InputErrors): {} extends InputErrors ? GetWithdrawalJobGroupByPayload<T> : Prisma.PrismaPromise<InputErrors>
  /**
   * Fields of the WithdrawalJob model
   */
  readonly fields: WithdrawalJobFieldRefs;
  }

  /**
   * The delegate class that acts as a "Promise-like" for WithdrawalJob.
   * Why is this prefixed with `Prisma__`?
   * Because we want to prevent naming conflicts as mentioned in
   * https://github.com/prisma/prisma-client-js/issues/707
   */
  export interface Prisma__WithdrawalJobClient<T, Null = never, ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> extends Prisma.PrismaPromise<T> {
    readonly [Symbol.toStringTag]: "PrismaPromise"
    /**
     * Attaches callbacks for the resolution and/or rejection of the Promise.
     * @param onfulfilled The callback to execute when the Promise is resolved.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of which ever callback is executed.
     */
    then<TResult1 = T, TResult2 = never>(onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null): $Utils.JsPromise<TResult1 | TResult2>
    /**
     * Attaches a callback for only the rejection of the Promise.
     * @param onrejected The callback to execute when the Promise is rejected.
     * @returns A Promise for the completion of the callback.
     */
    catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): $Utils.JsPromise<T | TResult>
    /**
     * Attaches a callback that is invoked when the Promise is settled (fulfilled or rejected). The
     * resolved value cannot be modified from the callback.
     * @param onfinally The callback to execute when the Promise is settled (fulfilled or rejected).
     * @returns A Promise for the completion of the callback.
     */
    finally(onfinally?: (() => void) | undefined | null): $Utils.JsPromise<T>
  }




  /**
   * Fields of the WithdrawalJob model
   */ 
  interface WithdrawalJobFieldRefs {
    readonly id: FieldRef<"WithdrawalJob", 'String'>
    readonly proofBase64: FieldRef<"WithdrawalJob", 'String'>
    readonly merkleRoot: FieldRef<"WithdrawalJob", 'String'>
    readonly nullifierHash: FieldRef<"WithdrawalJob", 'String'>
    readonly recipient: FieldRef<"WithdrawalJob", 'String'>
    readonly amount: FieldRef<"WithdrawalJob", 'String'>
    readonly fee: FieldRef<"WithdrawalJob", 'String'>
    readonly tokenMint: FieldRef<"WithdrawalJob", 'String'>
    readonly status: FieldRef<"WithdrawalJob", 'String'>
    readonly txSignature: FieldRef<"WithdrawalJob", 'String'>
    readonly attempts: FieldRef<"WithdrawalJob", 'Int'>
    readonly lastError: FieldRef<"WithdrawalJob", 'String'>
    readonly createdAt: FieldRef<"WithdrawalJob", 'DateTime'>
    readonly updatedAt: FieldRef<"WithdrawalJob", 'DateTime'>
  }
    

  // Custom InputTypes
  /**
   * WithdrawalJob findUnique
   */
  export type WithdrawalJobFindUniqueArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WithdrawalJob
     */
    select?: WithdrawalJobSelect<ExtArgs> | null
    /**
     * Filter, which WithdrawalJob to fetch.
     */
    where: WithdrawalJobWhereUniqueInput
  }

  /**
   * WithdrawalJob findUniqueOrThrow
   */
  export type WithdrawalJobFindUniqueOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WithdrawalJob
     */
    select?: WithdrawalJobSelect<ExtArgs> | null
    /**
     * Filter, which WithdrawalJob to fetch.
     */
    where: WithdrawalJobWhereUniqueInput
  }

  /**
   * WithdrawalJob findFirst
   */
  export type WithdrawalJobFindFirstArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WithdrawalJob
     */
    select?: WithdrawalJobSelect<ExtArgs> | null
    /**
     * Filter, which WithdrawalJob to fetch.
     */
    where?: WithdrawalJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WithdrawalJobs to fetch.
     */
    orderBy?: WithdrawalJobOrderByWithRelationInput | WithdrawalJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for WithdrawalJobs.
     */
    cursor?: WithdrawalJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WithdrawalJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WithdrawalJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of WithdrawalJobs.
     */
    distinct?: WithdrawalJobScalarFieldEnum | WithdrawalJobScalarFieldEnum[]
  }

  /**
   * WithdrawalJob findFirstOrThrow
   */
  export type WithdrawalJobFindFirstOrThrowArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WithdrawalJob
     */
    select?: WithdrawalJobSelect<ExtArgs> | null
    /**
     * Filter, which WithdrawalJob to fetch.
     */
    where?: WithdrawalJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WithdrawalJobs to fetch.
     */
    orderBy?: WithdrawalJobOrderByWithRelationInput | WithdrawalJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for searching for WithdrawalJobs.
     */
    cursor?: WithdrawalJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WithdrawalJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WithdrawalJobs.
     */
    skip?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/distinct Distinct Docs}
     * 
     * Filter by unique combinations of WithdrawalJobs.
     */
    distinct?: WithdrawalJobScalarFieldEnum | WithdrawalJobScalarFieldEnum[]
  }

  /**
   * WithdrawalJob findMany
   */
  export type WithdrawalJobFindManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WithdrawalJob
     */
    select?: WithdrawalJobSelect<ExtArgs> | null
    /**
     * Filter, which WithdrawalJobs to fetch.
     */
    where?: WithdrawalJobWhereInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/sorting Sorting Docs}
     * 
     * Determine the order of WithdrawalJobs to fetch.
     */
    orderBy?: WithdrawalJobOrderByWithRelationInput | WithdrawalJobOrderByWithRelationInput[]
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination#cursor-based-pagination Cursor Docs}
     * 
     * Sets the position for listing WithdrawalJobs.
     */
    cursor?: WithdrawalJobWhereUniqueInput
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Take `±n` WithdrawalJobs from the position of the cursor.
     */
    take?: number
    /**
     * {@link https://www.prisma.io/docs/concepts/components/prisma-client/pagination Pagination Docs}
     * 
     * Skip the first `n` WithdrawalJobs.
     */
    skip?: number
    distinct?: WithdrawalJobScalarFieldEnum | WithdrawalJobScalarFieldEnum[]
  }

  /**
   * WithdrawalJob create
   */
  export type WithdrawalJobCreateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WithdrawalJob
     */
    select?: WithdrawalJobSelect<ExtArgs> | null
    /**
     * The data needed to create a WithdrawalJob.
     */
    data: XOR<WithdrawalJobCreateInput, WithdrawalJobUncheckedCreateInput>
  }

  /**
   * WithdrawalJob createMany
   */
  export type WithdrawalJobCreateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to create many WithdrawalJobs.
     */
    data: WithdrawalJobCreateManyInput | WithdrawalJobCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * WithdrawalJob createManyAndReturn
   */
  export type WithdrawalJobCreateManyAndReturnArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WithdrawalJob
     */
    select?: WithdrawalJobSelectCreateManyAndReturn<ExtArgs> | null
    /**
     * The data used to create many WithdrawalJobs.
     */
    data: WithdrawalJobCreateManyInput | WithdrawalJobCreateManyInput[]
    skipDuplicates?: boolean
  }

  /**
   * WithdrawalJob update
   */
  export type WithdrawalJobUpdateArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WithdrawalJob
     */
    select?: WithdrawalJobSelect<ExtArgs> | null
    /**
     * The data needed to update a WithdrawalJob.
     */
    data: XOR<WithdrawalJobUpdateInput, WithdrawalJobUncheckedUpdateInput>
    /**
     * Choose, which WithdrawalJob to update.
     */
    where: WithdrawalJobWhereUniqueInput
  }

  /**
   * WithdrawalJob updateMany
   */
  export type WithdrawalJobUpdateManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * The data used to update WithdrawalJobs.
     */
    data: XOR<WithdrawalJobUpdateManyMutationInput, WithdrawalJobUncheckedUpdateManyInput>
    /**
     * Filter which WithdrawalJobs to update
     */
    where?: WithdrawalJobWhereInput
  }

  /**
   * WithdrawalJob upsert
   */
  export type WithdrawalJobUpsertArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WithdrawalJob
     */
    select?: WithdrawalJobSelect<ExtArgs> | null
    /**
     * The filter to search for the WithdrawalJob to update in case it exists.
     */
    where: WithdrawalJobWhereUniqueInput
    /**
     * In case the WithdrawalJob found by the `where` argument doesn't exist, create a new WithdrawalJob with this data.
     */
    create: XOR<WithdrawalJobCreateInput, WithdrawalJobUncheckedCreateInput>
    /**
     * In case the WithdrawalJob was found with the provided `where` argument, update it with this data.
     */
    update: XOR<WithdrawalJobUpdateInput, WithdrawalJobUncheckedUpdateInput>
  }

  /**
   * WithdrawalJob delete
   */
  export type WithdrawalJobDeleteArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WithdrawalJob
     */
    select?: WithdrawalJobSelect<ExtArgs> | null
    /**
     * Filter which WithdrawalJob to delete.
     */
    where: WithdrawalJobWhereUniqueInput
  }

  /**
   * WithdrawalJob deleteMany
   */
  export type WithdrawalJobDeleteManyArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Filter which WithdrawalJobs to delete
     */
    where?: WithdrawalJobWhereInput
  }

  /**
   * WithdrawalJob without action
   */
  export type WithdrawalJobDefaultArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = {
    /**
     * Select specific fields to fetch from the WithdrawalJob
     */
    select?: WithdrawalJobSelect<ExtArgs> | null
  }


  /**
   * Enums
   */

  export const TransactionIsolationLevel: {
    ReadUncommitted: 'ReadUncommitted',
    ReadCommitted: 'ReadCommitted',
    RepeatableRead: 'RepeatableRead',
    Serializable: 'Serializable'
  };

  export type TransactionIsolationLevel = (typeof TransactionIsolationLevel)[keyof typeof TransactionIsolationLevel]


  export const WithdrawalJobScalarFieldEnum: {
    id: 'id',
    proofBase64: 'proofBase64',
    merkleRoot: 'merkleRoot',
    nullifierHash: 'nullifierHash',
    recipient: 'recipient',
    amount: 'amount',
    fee: 'fee',
    tokenMint: 'tokenMint',
    status: 'status',
    txSignature: 'txSignature',
    attempts: 'attempts',
    lastError: 'lastError',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt'
  };

  export type WithdrawalJobScalarFieldEnum = (typeof WithdrawalJobScalarFieldEnum)[keyof typeof WithdrawalJobScalarFieldEnum]


  export const SortOrder: {
    asc: 'asc',
    desc: 'desc'
  };

  export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder]


  export const QueryMode: {
    default: 'default',
    insensitive: 'insensitive'
  };

  export type QueryMode = (typeof QueryMode)[keyof typeof QueryMode]


  export const NullsOrder: {
    first: 'first',
    last: 'last'
  };

  export type NullsOrder = (typeof NullsOrder)[keyof typeof NullsOrder]


  /**
   * Field references 
   */


  /**
   * Reference to a field of type 'String'
   */
  export type StringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String'>
    


  /**
   * Reference to a field of type 'String[]'
   */
  export type ListStringFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'String[]'>
    


  /**
   * Reference to a field of type 'Int'
   */
  export type IntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int'>
    


  /**
   * Reference to a field of type 'Int[]'
   */
  export type ListIntFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Int[]'>
    


  /**
   * Reference to a field of type 'DateTime'
   */
  export type DateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime'>
    


  /**
   * Reference to a field of type 'DateTime[]'
   */
  export type ListDateTimeFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'DateTime[]'>
    


  /**
   * Reference to a field of type 'Float'
   */
  export type FloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float'>
    


  /**
   * Reference to a field of type 'Float[]'
   */
  export type ListFloatFieldRefInput<$PrismaModel> = FieldRefInputType<$PrismaModel, 'Float[]'>
    
  /**
   * Deep Input Types
   */


  export type WithdrawalJobWhereInput = {
    AND?: WithdrawalJobWhereInput | WithdrawalJobWhereInput[]
    OR?: WithdrawalJobWhereInput[]
    NOT?: WithdrawalJobWhereInput | WithdrawalJobWhereInput[]
    id?: StringFilter<"WithdrawalJob"> | string
    proofBase64?: StringFilter<"WithdrawalJob"> | string
    merkleRoot?: StringFilter<"WithdrawalJob"> | string
    nullifierHash?: StringFilter<"WithdrawalJob"> | string
    recipient?: StringFilter<"WithdrawalJob"> | string
    amount?: StringFilter<"WithdrawalJob"> | string
    fee?: StringFilter<"WithdrawalJob"> | string
    tokenMint?: StringFilter<"WithdrawalJob"> | string
    status?: StringFilter<"WithdrawalJob"> | string
    txSignature?: StringNullableFilter<"WithdrawalJob"> | string | null
    attempts?: IntFilter<"WithdrawalJob"> | number
    lastError?: StringNullableFilter<"WithdrawalJob"> | string | null
    createdAt?: DateTimeFilter<"WithdrawalJob"> | Date | string
    updatedAt?: DateTimeFilter<"WithdrawalJob"> | Date | string
  }

  export type WithdrawalJobOrderByWithRelationInput = {
    id?: SortOrder
    proofBase64?: SortOrder
    merkleRoot?: SortOrder
    nullifierHash?: SortOrder
    recipient?: SortOrder
    amount?: SortOrder
    fee?: SortOrder
    tokenMint?: SortOrder
    status?: SortOrder
    txSignature?: SortOrderInput | SortOrder
    attempts?: SortOrder
    lastError?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WithdrawalJobWhereUniqueInput = Prisma.AtLeast<{
    id?: string
    nullifierHash?: string
    AND?: WithdrawalJobWhereInput | WithdrawalJobWhereInput[]
    OR?: WithdrawalJobWhereInput[]
    NOT?: WithdrawalJobWhereInput | WithdrawalJobWhereInput[]
    proofBase64?: StringFilter<"WithdrawalJob"> | string
    merkleRoot?: StringFilter<"WithdrawalJob"> | string
    recipient?: StringFilter<"WithdrawalJob"> | string
    amount?: StringFilter<"WithdrawalJob"> | string
    fee?: StringFilter<"WithdrawalJob"> | string
    tokenMint?: StringFilter<"WithdrawalJob"> | string
    status?: StringFilter<"WithdrawalJob"> | string
    txSignature?: StringNullableFilter<"WithdrawalJob"> | string | null
    attempts?: IntFilter<"WithdrawalJob"> | number
    lastError?: StringNullableFilter<"WithdrawalJob"> | string | null
    createdAt?: DateTimeFilter<"WithdrawalJob"> | Date | string
    updatedAt?: DateTimeFilter<"WithdrawalJob"> | Date | string
  }, "id" | "nullifierHash">

  export type WithdrawalJobOrderByWithAggregationInput = {
    id?: SortOrder
    proofBase64?: SortOrder
    merkleRoot?: SortOrder
    nullifierHash?: SortOrder
    recipient?: SortOrder
    amount?: SortOrder
    fee?: SortOrder
    tokenMint?: SortOrder
    status?: SortOrder
    txSignature?: SortOrderInput | SortOrder
    attempts?: SortOrder
    lastError?: SortOrderInput | SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
    _count?: WithdrawalJobCountOrderByAggregateInput
    _avg?: WithdrawalJobAvgOrderByAggregateInput
    _max?: WithdrawalJobMaxOrderByAggregateInput
    _min?: WithdrawalJobMinOrderByAggregateInput
    _sum?: WithdrawalJobSumOrderByAggregateInput
  }

  export type WithdrawalJobScalarWhereWithAggregatesInput = {
    AND?: WithdrawalJobScalarWhereWithAggregatesInput | WithdrawalJobScalarWhereWithAggregatesInput[]
    OR?: WithdrawalJobScalarWhereWithAggregatesInput[]
    NOT?: WithdrawalJobScalarWhereWithAggregatesInput | WithdrawalJobScalarWhereWithAggregatesInput[]
    id?: StringWithAggregatesFilter<"WithdrawalJob"> | string
    proofBase64?: StringWithAggregatesFilter<"WithdrawalJob"> | string
    merkleRoot?: StringWithAggregatesFilter<"WithdrawalJob"> | string
    nullifierHash?: StringWithAggregatesFilter<"WithdrawalJob"> | string
    recipient?: StringWithAggregatesFilter<"WithdrawalJob"> | string
    amount?: StringWithAggregatesFilter<"WithdrawalJob"> | string
    fee?: StringWithAggregatesFilter<"WithdrawalJob"> | string
    tokenMint?: StringWithAggregatesFilter<"WithdrawalJob"> | string
    status?: StringWithAggregatesFilter<"WithdrawalJob"> | string
    txSignature?: StringNullableWithAggregatesFilter<"WithdrawalJob"> | string | null
    attempts?: IntWithAggregatesFilter<"WithdrawalJob"> | number
    lastError?: StringNullableWithAggregatesFilter<"WithdrawalJob"> | string | null
    createdAt?: DateTimeWithAggregatesFilter<"WithdrawalJob"> | Date | string
    updatedAt?: DateTimeWithAggregatesFilter<"WithdrawalJob"> | Date | string
  }

  export type WithdrawalJobCreateInput = {
    id?: string
    proofBase64: string
    merkleRoot: string
    nullifierHash: string
    recipient: string
    amount: string
    fee: string
    tokenMint: string
    status?: string
    txSignature?: string | null
    attempts?: number
    lastError?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WithdrawalJobUncheckedCreateInput = {
    id?: string
    proofBase64: string
    merkleRoot: string
    nullifierHash: string
    recipient: string
    amount: string
    fee: string
    tokenMint: string
    status?: string
    txSignature?: string | null
    attempts?: number
    lastError?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WithdrawalJobUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    proofBase64?: StringFieldUpdateOperationsInput | string
    merkleRoot?: StringFieldUpdateOperationsInput | string
    nullifierHash?: StringFieldUpdateOperationsInput | string
    recipient?: StringFieldUpdateOperationsInput | string
    amount?: StringFieldUpdateOperationsInput | string
    fee?: StringFieldUpdateOperationsInput | string
    tokenMint?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    txSignature?: NullableStringFieldUpdateOperationsInput | string | null
    attempts?: IntFieldUpdateOperationsInput | number
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WithdrawalJobUncheckedUpdateInput = {
    id?: StringFieldUpdateOperationsInput | string
    proofBase64?: StringFieldUpdateOperationsInput | string
    merkleRoot?: StringFieldUpdateOperationsInput | string
    nullifierHash?: StringFieldUpdateOperationsInput | string
    recipient?: StringFieldUpdateOperationsInput | string
    amount?: StringFieldUpdateOperationsInput | string
    fee?: StringFieldUpdateOperationsInput | string
    tokenMint?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    txSignature?: NullableStringFieldUpdateOperationsInput | string | null
    attempts?: IntFieldUpdateOperationsInput | number
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WithdrawalJobCreateManyInput = {
    id?: string
    proofBase64: string
    merkleRoot: string
    nullifierHash: string
    recipient: string
    amount: string
    fee: string
    tokenMint: string
    status?: string
    txSignature?: string | null
    attempts?: number
    lastError?: string | null
    createdAt?: Date | string
    updatedAt?: Date | string
  }

  export type WithdrawalJobUpdateManyMutationInput = {
    id?: StringFieldUpdateOperationsInput | string
    proofBase64?: StringFieldUpdateOperationsInput | string
    merkleRoot?: StringFieldUpdateOperationsInput | string
    nullifierHash?: StringFieldUpdateOperationsInput | string
    recipient?: StringFieldUpdateOperationsInput | string
    amount?: StringFieldUpdateOperationsInput | string
    fee?: StringFieldUpdateOperationsInput | string
    tokenMint?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    txSignature?: NullableStringFieldUpdateOperationsInput | string | null
    attempts?: IntFieldUpdateOperationsInput | number
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type WithdrawalJobUncheckedUpdateManyInput = {
    id?: StringFieldUpdateOperationsInput | string
    proofBase64?: StringFieldUpdateOperationsInput | string
    merkleRoot?: StringFieldUpdateOperationsInput | string
    nullifierHash?: StringFieldUpdateOperationsInput | string
    recipient?: StringFieldUpdateOperationsInput | string
    amount?: StringFieldUpdateOperationsInput | string
    fee?: StringFieldUpdateOperationsInput | string
    tokenMint?: StringFieldUpdateOperationsInput | string
    status?: StringFieldUpdateOperationsInput | string
    txSignature?: NullableStringFieldUpdateOperationsInput | string | null
    attempts?: IntFieldUpdateOperationsInput | number
    lastError?: NullableStringFieldUpdateOperationsInput | string | null
    createdAt?: DateTimeFieldUpdateOperationsInput | Date | string
    updatedAt?: DateTimeFieldUpdateOperationsInput | Date | string
  }

  export type StringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type StringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type IntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type DateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type SortOrderInput = {
    sort: SortOrder
    nulls?: NullsOrder
  }

  export type WithdrawalJobCountOrderByAggregateInput = {
    id?: SortOrder
    proofBase64?: SortOrder
    merkleRoot?: SortOrder
    nullifierHash?: SortOrder
    recipient?: SortOrder
    amount?: SortOrder
    fee?: SortOrder
    tokenMint?: SortOrder
    status?: SortOrder
    txSignature?: SortOrder
    attempts?: SortOrder
    lastError?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WithdrawalJobAvgOrderByAggregateInput = {
    attempts?: SortOrder
  }

  export type WithdrawalJobMaxOrderByAggregateInput = {
    id?: SortOrder
    proofBase64?: SortOrder
    merkleRoot?: SortOrder
    nullifierHash?: SortOrder
    recipient?: SortOrder
    amount?: SortOrder
    fee?: SortOrder
    tokenMint?: SortOrder
    status?: SortOrder
    txSignature?: SortOrder
    attempts?: SortOrder
    lastError?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WithdrawalJobMinOrderByAggregateInput = {
    id?: SortOrder
    proofBase64?: SortOrder
    merkleRoot?: SortOrder
    nullifierHash?: SortOrder
    recipient?: SortOrder
    amount?: SortOrder
    fee?: SortOrder
    tokenMint?: SortOrder
    status?: SortOrder
    txSignature?: SortOrder
    attempts?: SortOrder
    lastError?: SortOrder
    createdAt?: SortOrder
    updatedAt?: SortOrder
  }

  export type WithdrawalJobSumOrderByAggregateInput = {
    attempts?: SortOrder
  }

  export type StringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type StringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    mode?: QueryMode
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type IntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type DateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }

  export type StringFieldUpdateOperationsInput = {
    set?: string
  }

  export type NullableStringFieldUpdateOperationsInput = {
    set?: string | null
  }

  export type IntFieldUpdateOperationsInput = {
    set?: number
    increment?: number
    decrement?: number
    multiply?: number
    divide?: number
  }

  export type DateTimeFieldUpdateOperationsInput = {
    set?: Date | string
  }

  export type NestedStringFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringFilter<$PrismaModel> | string
  }

  export type NestedStringNullableFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableFilter<$PrismaModel> | string | null
  }

  export type NestedIntFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntFilter<$PrismaModel> | number
  }

  export type NestedDateTimeFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeFilter<$PrismaModel> | Date | string
  }

  export type NestedStringWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel>
    in?: string[] | ListStringFieldRefInput<$PrismaModel>
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel>
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringWithAggregatesFilter<$PrismaModel> | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedStringFilter<$PrismaModel>
    _max?: NestedStringFilter<$PrismaModel>
  }

  export type NestedStringNullableWithAggregatesFilter<$PrismaModel = never> = {
    equals?: string | StringFieldRefInput<$PrismaModel> | null
    in?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    notIn?: string[] | ListStringFieldRefInput<$PrismaModel> | null
    lt?: string | StringFieldRefInput<$PrismaModel>
    lte?: string | StringFieldRefInput<$PrismaModel>
    gt?: string | StringFieldRefInput<$PrismaModel>
    gte?: string | StringFieldRefInput<$PrismaModel>
    contains?: string | StringFieldRefInput<$PrismaModel>
    startsWith?: string | StringFieldRefInput<$PrismaModel>
    endsWith?: string | StringFieldRefInput<$PrismaModel>
    not?: NestedStringNullableWithAggregatesFilter<$PrismaModel> | string | null
    _count?: NestedIntNullableFilter<$PrismaModel>
    _min?: NestedStringNullableFilter<$PrismaModel>
    _max?: NestedStringNullableFilter<$PrismaModel>
  }

  export type NestedIntNullableFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel> | null
    in?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel> | null
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntNullableFilter<$PrismaModel> | number | null
  }

  export type NestedIntWithAggregatesFilter<$PrismaModel = never> = {
    equals?: number | IntFieldRefInput<$PrismaModel>
    in?: number[] | ListIntFieldRefInput<$PrismaModel>
    notIn?: number[] | ListIntFieldRefInput<$PrismaModel>
    lt?: number | IntFieldRefInput<$PrismaModel>
    lte?: number | IntFieldRefInput<$PrismaModel>
    gt?: number | IntFieldRefInput<$PrismaModel>
    gte?: number | IntFieldRefInput<$PrismaModel>
    not?: NestedIntWithAggregatesFilter<$PrismaModel> | number
    _count?: NestedIntFilter<$PrismaModel>
    _avg?: NestedFloatFilter<$PrismaModel>
    _sum?: NestedIntFilter<$PrismaModel>
    _min?: NestedIntFilter<$PrismaModel>
    _max?: NestedIntFilter<$PrismaModel>
  }

  export type NestedFloatFilter<$PrismaModel = never> = {
    equals?: number | FloatFieldRefInput<$PrismaModel>
    in?: number[] | ListFloatFieldRefInput<$PrismaModel>
    notIn?: number[] | ListFloatFieldRefInput<$PrismaModel>
    lt?: number | FloatFieldRefInput<$PrismaModel>
    lte?: number | FloatFieldRefInput<$PrismaModel>
    gt?: number | FloatFieldRefInput<$PrismaModel>
    gte?: number | FloatFieldRefInput<$PrismaModel>
    not?: NestedFloatFilter<$PrismaModel> | number
  }

  export type NestedDateTimeWithAggregatesFilter<$PrismaModel = never> = {
    equals?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    in?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    notIn?: Date[] | string[] | ListDateTimeFieldRefInput<$PrismaModel>
    lt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    lte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gt?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    gte?: Date | string | DateTimeFieldRefInput<$PrismaModel>
    not?: NestedDateTimeWithAggregatesFilter<$PrismaModel> | Date | string
    _count?: NestedIntFilter<$PrismaModel>
    _min?: NestedDateTimeFilter<$PrismaModel>
    _max?: NestedDateTimeFilter<$PrismaModel>
  }



  /**
   * Aliases for legacy arg types
   */
    /**
     * @deprecated Use WithdrawalJobDefaultArgs instead
     */
    export type WithdrawalJobArgs<ExtArgs extends $Extensions.InternalArgs = $Extensions.DefaultArgs> = WithdrawalJobDefaultArgs<ExtArgs>

  /**
   * Batch Payload for updateMany & deleteMany & createMany
   */

  export type BatchPayload = {
    count: number
  }

  /**
   * DMMF
   */
  export const dmmf: runtime.BaseDMMF
}
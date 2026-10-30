import {
  IPaginationOptions,
  Pagination,
  paginate,
} from 'nestjs-typeorm-paginate';
import {
  EntityManager,
  EntityTarget,
  FindManyOptions,
  ObjectLiteral,
  Repository,
} from 'typeorm';

export class TypeOrmRepository<
  Entity extends ObjectLiteral,
> extends Repository<Entity> {
  constructor(
    private readonly entityTarget: EntityTarget<Entity>,
    private readonly entityManager: EntityManager,
  ) {
    super(entityTarget, entityManager);
  }

  findMany(
    options: IPaginationOptions,
    findOptions?: FindManyOptions<Entity>,
  ): Promise<Pagination<Entity>> {
    return paginate<Entity>(this, options, findOptions);
  }

  withManager(manager: EntityManager): this {
    const bound = Object.create(Object.getPrototypeOf(this) as object) as this;
    return Object.assign(bound, this, { manager, entityManager: manager, queryRunner: manager.queryRunner });
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supplier } from '../shared/entities/supplier.entity';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { BaseService } from '@apis/shared/base.service';
import { SearchSupplierDto } from '@apis/suppliers/dto/search-supplier.dto';

@Injectable()
export class SuppliersService extends BaseService<Supplier, CreateSupplierDto, UpdateSupplierDto> {
  protected readonly entityName = 'suppliers';
  protected readonly relations = ['created_by', 'updated_by'];

  constructor(
    @InjectRepository(Supplier)
    protected readonly repo: Repository<Supplier>,
  ) {
    super();
  }

  async findAll(filters?: SearchSupplierDto): Promise<Supplier[]> {
    const qb = this.repo.createQueryBuilder('suppliers');
    qb.where('suppliers.deleted = :deleted', { deleted: false });

    if (filters) {
      this.applyFilters(qb, filters, 'suppliers', ['deleted']);
    }

    return qb.orderBy('suppliers.id', 'ASC').getMany();
  }

  async create(dto: CreateSupplierDto, userId?: number): Promise<Supplier> {
    const existing = await this.repo.findOne({
      where: { supplier_id: dto.supplier_id },
    });
    if (existing) {
      throw new BadRequestException('ID fornitore già utilizzato.');
    }
    return super.create(dto, userId);
  }

  async update(
    id: number,
    updateSupplierDto: UpdateSupplierDto,
    userId?: number,
  ): Promise<Supplier> {
    const supplier = await this.findOne(id);
    if (!supplier) throw new BadRequestException('Supplier non trovato');

    if (updateSupplierDto.supplier_id && updateSupplierDto.supplier_id !== supplier.supplier_id) {
      const existing = await this.repo.findOne({
        where: { supplier_id: updateSupplierDto.supplier_id },
      });
      if (existing && existing.id !== id) {
        throw new BadRequestException("L'ID fornitore è già presente");
      }
    }

    if (
      updateSupplierDto.company_name &&
      updateSupplierDto.company_name !== supplier.company_name
    ) {
      const existing = await this.repo.findOne({
        where: { company_name: updateSupplierDto.company_name },
      });
      if (existing && existing.id !== id) {
        throw new BadRequestException('La ragione sociale è già presente');
      }
    }

    return super.update(id, updateSupplierDto, userId);
  }
}

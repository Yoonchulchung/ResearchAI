import { Entity, Column, PrimaryColumn, CreateDateColumn } from "typeorm";

@Entity('api_key')
export class ApiKeyEntity {

  @PrimaryColumn()
  id: string;

  @Column({ name: 'api_name' })
  apiName: string;

  @Column()
  key: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

}

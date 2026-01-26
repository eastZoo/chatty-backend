import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity()
export class AppSetting {
  @PrimaryColumn()
  key: string;

  @Column('varchar', { length: 255 })
  value: string;
}

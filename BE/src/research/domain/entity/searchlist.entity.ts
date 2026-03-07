import {Column, ManyToOne, CreateDateColumn, PrimaryColumn, Entity, JoinColumn} from 'typeorm';
import { LightResearchEntity } from './lightsearch.entity';

@Entity('search_list')
export class SearchListEntity{

  @PrimaryColumn()
  id: string;
  
  @Column({ name: 'light_research_id' })
  lightResearchId: string;

  @ManyToOne(() => LightResearchEntity, (lightResearch) => lightResearch.searchList)
  @JoinColumn({ name: 'light_research_id' })
  lightResearch: LightResearchEntity;

  @Column()
  topic: string;

  @Column()
  prompt: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

}

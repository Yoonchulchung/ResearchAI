import {Column, ManyToOne, CreateDateColumn, PrimaryColumn, Entity, JoinColumn} from 'typeorm';
import { LightResearchEntity } from './lightsearch.entity';

@Entity('research_recruit')
export class ResearchRecruitEntity {

  @PrimaryColumn()
  id: string;

  @Column({ name: 'light_research_id' })
  lightResearchId: string;

  @ManyToOne(() => LightResearchEntity, (lightResearch) => lightResearch.recruits)
  @JoinColumn({ name: 'light_research_id' })
  lightResearch: LightResearchEntity;

  @Column()
  topic: string;

  @Column()
  detail: string;

  @Column({ name: 'recruit_created_at' })
  recruitCreatedAt: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

}

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

  @Column({ type: 'text', nullable: true })
  topic: string | null;

  @Column({ type: 'text', nullable: true })
  detail: string | null;

  @Column({ type: 'text', nullable: true })
  location: string | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text', nullable: true })
  skills: string | null;

  @Column({ type: 'text', nullable: true })
  url: string | null;

  @Column({ name: 'recruit_created_at' })
  recruitCreatedAt: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

}

import { Column, CreateDateColumn, PrimaryColumn, Entity, OneToMany } from 'typeorm';
import { SearchListEntity } from './searchlist.entity';
import { ResearchRecruitEntity } from './researchrecruit.entity';

@Entity('light_research')
export class LightResearchEntity {

  @PrimaryColumn()
  id: string;

  @Column({ name: 'request_question' })
  requestQuestion: string;

  @Column({ name: 'research_cloud_ai_model' })
  researchCloudAiModel: string;

  @Column({ name: 'research_local_ai_model' })
  researchLocalAIModel: string;

  @Column({ name: 'research_web_model' })
  researchWebModel: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => SearchListEntity, (item) => item.lightResearch)
  searchList: SearchListEntity[];

  @OneToMany(() => ResearchRecruitEntity, (item) => item.lightResearch)
  recruits: ResearchRecruitEntity[];

}

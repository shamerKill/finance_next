import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { RouterModule } from '@nestjs/core';
import { OptionModule } from './routers/option/option.module';

@Module({
  imports: [
    MongooseModule.forRoot(
      'mongodb+srv://shamer:l\'mKL1995lin@cluster0.bmqxtzh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0',
      {
        dbName: 'finance'
      }
    ),
    RouterModule.register([
      {
        path: 'v1',
        children: [
          OptionModule,
        ],
      }
    ]),
    OptionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

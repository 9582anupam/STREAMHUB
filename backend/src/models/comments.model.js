import mongoose from 'mongoose';
import mongooseaggregatePaginate from 'mongoose-aggregate-paginate-v2';

const commentSchema = new mongoose.Schema(
    {
        content: {
            type: String,
            required: true,
        },
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        video: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Video',
        }
    },
    {
        timestamps: true,
    });


commentSchema.plugin(mongooseaggregatePaginate);

const Comment = mongoose.model('Comment', commentSchema);